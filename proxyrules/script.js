// ============================================================
// Clash Party 覆写脚本
//
// 做的事：
//   1. 只开一个混合端口（默认 7890），不开 TUN
//   2. 设置国内 DNS（fake-ip + 阿里/腾讯 DoH）
//   3. 国外节点按国家分组，国内节点单独一组
//   4. 规则：广告 -> 局域网 -> 国内 -> 苹果/微软 CDN -> AI/电报/流媒体 -> 强制直连 -> 下载 -> 兜底

// ---------------- 配置 ----------------
var CONFIG = {
    // 混合代理端口
    port: 7890,

    // 是否去广告（关掉后 ad / reject-non-ip / reject-drop / reject-ip 四个规则集和对应规则都不生成）
    enableAdBlock: true,

    // 自定义规则：插在去广告之后、其它规则之前
    // 目标可写策略组名、节点名，或 DIRECT / REJECT；目标不存在时这条会被自动跳过
    customRules: [
        "DOMAIN-SUFFIX,4399.cn,CSTEAM-VPN",
        "DOMAIN-SUFFIX,red.unicom,CSTEAM-VPN"
    ],

    // 测速地址（返回 204 的地址，内核默认期望 204）
    testUrl: "https://cp.cloudflare.com",
    // 测速间隔（秒）
    testInterval: 300,
    // 测速容差（毫秒），延迟差超过这个值才切换节点
    tolerance: 50,

    // 节点名里带这些词的，归为「国内节点」
    chinaKeywords:
        "中国|国内|电信|联通|移动|铁通|广电|教育网|" +
        "上海|北京|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|" +
        "河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|宁夏|新疆|西藏|内蒙古",

    // 机场塞进订阅的公告节点（不是真节点），命中就忽略
    infoNodeKeywords:
        "剩余|到期|套餐|官网|订阅|流量|过滤|线路|重置|客服|公告|通知|试用",

    // 国家 / 地区关键词，节点名命中哪一组就归到哪一组
    regions: {
        HK: "(香港|Hong Kong|HongKong|" + wordCode("HK") + ")",
        MO: "(澳门|澳門|Macao|Macau|" + wordCode("MO") + ")",
        TW: "(台湾|台灣|Taiwan|" + wordCode("TW") + ")",
        SG: "(新加坡|狮城|Singapore|" + wordCode("SG") + ")",
        JP: "(日本|Japan|东京|大阪|" + wordCode("JP") + ")",
        KR: "(韩国|韓國|Korea|首尔|首爾|" + wordCode("KR") + ")",
        US: "(美国|美國|United States|America|洛杉矶|圣何塞|西雅图|纽约|达拉斯|" + wordCode("US") + ")",
        UK: "(英国|英國|United Kingdom|Britain|伦敦|" + wordCode("UK") + ")",
        FR: "(法国|法國|France|巴黎|" + wordCode("FR") + ")",
        DE: "(德国|德國|Germany|法兰克福|" + wordCode("DE") + ")"
    },

    // 规则集地址（ruleset.skk.moe）
    rulesets: {
        // 广告：纯域名列表（约 14.5 万条），behavior 用 domain
        ad: "https://ruleset.skk.moe/Clash/domainset/reject.txt",
        // 广告：domainset 覆盖不到的部分（DOMAIN-KEYWORD / DOMAIN-WILDCARD / IP-CIDR）
        rejectNonIp: "https://ruleset.skk.moe/Clash/non_ip/reject.txt",
        // 广告：QUIC 类静默丢弃，避免请求卡住
        rejectDrop: "https://ruleset.skk.moe/Clash/non_ip/reject-drop.txt",
        // 广告：PCDN 吸血域名（p2p.qq.com、pcdn.yximgs.com、douyucdn.cn 等），用 REJECT 不用 DROP
        rejectNoDrop: "https://ruleset.skk.moe/Clash/non_ip/reject-no-drop.txt",
        // 广告：用 IP 直连的广告
        rejectIp: "https://ruleset.skk.moe/Clash/ip/reject.txt",
        // 局域网域名（路由器管理页 / NAS / 打印机）
        lan: "https://ruleset.skk.moe/Clash/non_ip/lan.txt",
        // 私网 / 回环 IP 段（127.0.0.0/8、192.168.0.0/16 等）
        lanIp: "https://ruleset.skk.moe/Clash/ip/lan.txt",
        // 国内域名（省一次 DNS 解析，也避免解析到境外 CDN 被误判）
        domestic: "https://ruleset.skk.moe/Clash/non_ip/domestic.txt",
        // 苹果 CDN / 苹果国内域名
        appleCdn: "https://ruleset.skk.moe/Clash/domainset/apple_cdn.txt",
        appleCn: "https://ruleset.skk.moe/Clash/non_ip/apple_cn.txt",
        // 微软 CDN（系统更新 / Office 下载）
        microsoftCdn: "https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt",
        // 苹果服务（iCloud / App Store / Apple News 等）
        appleServices: "https://ruleset.skk.moe/Clash/non_ip/apple_services.txt",
        // 微软服务（Outlook / Office / Bing / Azure 等）
        microsoftServices: "https://ruleset.skk.moe/Clash/non_ip/microsoft.txt",
        // AI 服务
        ai: "https://ruleset.skk.moe/Clash/non_ip/ai.txt",
        // 电报（域名 + IP）
        telegramDomain: "https://ruleset.skk.moe/Clash/non_ip/telegram.txt",
        telegramIp: "https://ruleset.skk.moe/Clash/ip/telegram.txt",
        // 流媒体（域名 + IP）
        stream: "https://ruleset.skk.moe/Clash/non_ip/stream.txt",
        streamIp: "https://ruleset.skk.moe/Clash/ip/stream.txt",
        // 强制直连（银行 / 政务 / 企业内网）
        direct: "https://ruleset.skk.moe/Clash/non_ip/direct.txt",
        // 大文件下载
        downloadDomainset: "https://ruleset.skk.moe/Clash/domainset/download.txt",
        download: "https://ruleset.skk.moe/Clash/non_ip/download.txt"
    }
};

// ---------------- 常量 ----------------
// 内核内置的策略名
var BUILTIN_POLICIES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];

// ---------------- 工具函数 ----------------

// 英文缩写前后不能紧跟其它字母，否则 Russia 里的 us 会被当成美国
function wordCode(code) {
    return "(?:^|[^A-Za-z])" + code + "(?:[^A-Za-z]|$)";
}

// 生成一个规则集配置（只在 buildRules 里用到）
//   url      规则集地址
//   behavior 规则集格式：domainset 目录用 domain，non_ip / ip 目录用 classical
//   path     本地缓存文件
function createProvider(url, behavior, path) {
    return {
        type: "http",
        behavior: behavior,
        url: url,
        path: path,
        interval: 43200,
        format: "text",
        proxy: "🌍 国外代理"
    };
}

// ---------------- 入口 ----------------

// 覆写入口：Clash Party 会把订阅配置作为 params 传进来
function main(params) {
    setupBasic(params);
    setupDns(params);
    const groups = buildGroups(params);
    buildRules(params, groups);
    return params;
}

// ---------------- 各步骤 ----------------

// 基础设置：只保留一个混合端口
// 注：订阅里如果自带 port / socks-port / listeners / tun，会保持原样，需要时手动补
function setupBasic(params) {
    params["mixed-port"] = CONFIG.port;
    params["allow-lan"] = false;
    params["mode"] = "rule";
    params["log-level"] = "info";
}

// DNS：普通域名和节点域名都用国内 DNS 解析，避免还没连上代理就卡在解析
function setupDns(params) {
    params.dns = {
        enable: true,
        ipv6: false,
        "enhanced-mode": "fake-ip",
        "fake-ip-range": "198.18.0.1/16",
        // 用来解析下面这些 DNS 服务器自己的域名，必须是 IP
        "default-nameserver": ["223.5.5.5", "119.29.29.29"],
        // 普通域名
        nameserver: ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"],
        // 解析节点服务器的域名
        "proxy-server-nameserver": ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"],
        // 这些域名不用假 IP，否则局域网设备 / 对时 / 语音通话会出问题
        "fake-ip-filter": [
            "+.lan",
            "+.local",
            "*.m2m",
            "time.*.com",
            "ntp.*.com",
            "stun.*",
            "dns.msftncsi.com",
            "+.push.apple.com"
        ]
    };
}

// 分组：国外节点按国家切分，国内节点单独一组
function buildGroups(params) {
    // 订阅里的所有节点名
    const allNames = (params.proxies || []).map(function (p) {
        return p.name;
    });

    // 剔除机场公告节点
    const infoRe = new RegExp(CONFIG.infoNodeKeywords, "i");
    const validNames = allNames.filter(function (name) {
        return !infoRe.test(name);
    });

    // 国家关键词拼成一条，供「其它」和国内判定使用
    const regionExpressions = Object.keys(CONFIG.regions).map(function (code) {
        return CONFIG.regions[code];
    });

    // 国内节点：命中省份 / 运营商关键词，且不是港澳台或境外节点
    const chinaRe = new RegExp(
        "^(?=.*(?:" + CONFIG.chinaKeywords + "))(?!.*(?:" +
            regionExpressions.join("|") + "|" + CONFIG.infoNodeKeywords + ")).*$",
        "i"
    );
    const chinaNames = validNames.filter(function (name) {
        return chinaRe.test(name);
    });
    const foreignNames = validNames.filter(function (name) {
        return !chinaRe.test(name);
    });

    // 国家 / 地区自动选择组（没有对应节点就不生成）
    const regionGroups = [];
    Object.keys(CONFIG.regions).forEach(function (code) {
        const re = new RegExp(
            "^(?=.*" + CONFIG.regions[code] + ")(?!.*(?:" + CONFIG.infoNodeKeywords + ")).*$",
            "i"
        );
        const proxies = validNames.filter(function (name) {
            return re.test(name);
        });
        if (proxies.length > 0) {
            regionGroups.push({
                name: code + " - 自动选择",
                type: "url-test",
                url: CONFIG.testUrl,
                interval: CONFIG.testInterval,
                tolerance: CONFIG.tolerance,
                hidden: true,
                proxies: proxies
            });
        }
    });

    // 其它：既不是国内、也不属于任何国家的节点
    const otherRe = new RegExp(
        "^(?!.*(?:" + regionExpressions.join("|") + "|" + CONFIG.chinaKeywords + "|" +
            CONFIG.infoNodeKeywords + ")).*$",
        "i"
    );
    const otherNames = validNames.filter(function (name) {
        return otherRe.test(name);
    });
    if (otherNames.length > 0) {
        regionGroups.push({
            name: "其它 - 自动选择",
            type: "url-test",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            tolerance: CONFIG.tolerance,
            hidden: true,
            proxies: otherNames
        });
    }

    const regionGroupNames = regionGroups.map(function (group) {
        return group.name;
    });
    const hasForeign = foreignNames.length > 0;
    const hasChina = chinaNames.length > 0;

    const groups = [];

    // 国外入口：自动选最快 / 手动挑节点 / 负载均衡 / 直连
    const foreignEntry = [];
    if (hasForeign) {
        foreignEntry.push("🇺🇳 国外自动选择", "🇺🇳 国外手动选择", "⚖️ 国外负载均衡");
    }
    foreignEntry.push("DIRECT");
    groups.push({
        name: "🌍 国外代理",
        type: "select",
        proxies: foreignEntry
    });

    // 国内入口：默认直连，需要时切到国内节点
    groups.push({
        name: "🇨🇳 国内代理",
        type: "select",
        proxies: hasChina ? ["DIRECT", "🇨🇳 国内手动选择"] : ["DIRECT"]
    });

    // 国外自动选择：ALL 组 + 各国组
    if (hasForeign) {
        groups.push({
            name: "🇺🇳 国外自动选择",
            type: "select",
            proxies: ["ALL - 国外自动选择"].concat(regionGroupNames)
        });
        groups.push({
            name: "🇺🇳 国外手动选择",
            type: "select",
            proxies: foreignNames
        });
        groups.push({
            name: "ALL - 国外自动选择",
            type: "url-test",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            tolerance: CONFIG.tolerance,
            hidden: true,
            proxies: foreignNames
        });
        // 同一个域名始终走同一个节点，避免流媒体 / 登录状态来回跳
        groups.push({
            name: "⚖️ 国外负载均衡",
            type: "load-balance",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            strategy: "consistent-hashing",
            proxies: foreignNames
        });
    }

    // 国内手动选择
    if (hasChina) {
        groups.push({
            name: "🇨🇳 国内手动选择",
            type: "select",
            proxies: chinaNames
        });
    }

    // 国家 / 地区自动选择组
    groups.push.apply(groups, regionGroups);

    // 业务分组：默认走国外入口，可切到任意国家组
    const serviceProxies = ["🌍 国外代理"].concat(regionGroupNames);
    // 有美国节点时，AI / 流媒体默认走美国
    const preferUs = function (list) {
        return regionGroupNames.indexOf("US - 自动选择") >= 0
            ? ["US - 自动选择"].concat(
                  list.filter(function (name) {
                      return name !== "US - 自动选择";
                  })
              )
            : list;
    };

    groups.push({
        name: "🤖 AIGC",
        type: "select",
        proxies: preferUs(serviceProxies)
    });
    groups.push({
        name: "📺 流媒体",
        type: "select",
        proxies: preferUs(serviceProxies)
    });
    groups.push({
        name: "✈️ 电报信息",
        type: "select",
        proxies: serviceProxies
    });
    groups.push({
        name: "🍎 苹果服务",
        type: "select",
        proxies: ["DIRECT"].concat(serviceProxies)
    });
    groups.push({
        name: "Ⓜ️ 微软服务",
        type: "select",
        proxies: ["DIRECT"].concat(serviceProxies)
    });

    params["proxy-groups"] = groups;
    return groups;
}

// 规则：域名类在前，IP 类在后，避免域名请求先做无谓的 IP 解析
function buildRules(params, groups) {
    const groupNames = (groups || []).map(function (group) {
        return group.name;
    });
    const proxyNames = (params.proxies || []).map(function (p) {
        return p.name;
    });

    // 取规则的目标策略（跳过 no-resolve 这类参数）
    const policyOf = function (rule) {
        const parts = rule.split(",");
        return parts[parts.length - 1] === "no-resolve"
            ? parts[parts.length - 2]
            : parts[parts.length - 1];
    };

    // 引用的策略必须存在，否则内核会拒绝加载整份配置
    const isKnownPolicy = function (policy) {
        return (
            groupNames.indexOf(policy) >= 0 ||
            proxyNames.indexOf(policy) >= 0 ||
            BUILTIN_POLICIES.indexOf(policy) >= 0
        );
    };

    const rules = [];

    // 广告
    if (CONFIG.enableAdBlock) {
        rules.push("RULE-SET,ad,REJECT");
    }

    // 自定义规则
    CONFIG.customRules.forEach(function (rule) {
        if (isKnownPolicy(policyOf(rule))) {
            rules.push(rule);
        }
    });

    // 广告（domainset 覆盖不到的 keyword / wildcard / IP 部分）
    if (CONFIG.enableAdBlock) {
        rules.push("RULE-SET,reject-non-ip,REJECT");
        rules.push("RULE-SET,reject-drop,REJECT-DROP");
        rules.push("RULE-SET,reject-no-drop,REJECT");
    }

    // 局域网 / 国内域名
    rules.push("RULE-SET,lan,DIRECT");
    rules.push("RULE-SET,domestic,🇨🇳 国内代理");

    // 苹果 / 微软 CDN 直连，避免走代理拖慢下载
    rules.push("RULE-SET,apple-cdn,DIRECT");
    rules.push("RULE-SET,apple-cn,DIRECT");
    rules.push("RULE-SET,apple-services,🍎 苹果服务");
    rules.push("RULE-SET,microsoft-cdn,DIRECT");
    rules.push("RULE-SET,microsoft-services,Ⓜ️ 微软服务");

    // AI / 电报 / 流媒体
    rules.push("RULE-SET,ai,🤖 AIGC");
    rules.push("RULE-SET,telegram-domain,✈️ 电报信息");
    rules.push("RULE-SET,stream,📺 流媒体");

    // 强制直连 / 下载
    rules.push("RULE-SET,direct,DIRECT");
    rules.push("RULE-SET,download-domainset,🌍 国外代理");
    rules.push("RULE-SET,download,🌍 国外代理");

    // 私网 / 回环 / 组播直连（127.0.0.1、192.168.x.x 等走代理必然失败）
    rules.push("RULE-SET,lan-ip,DIRECT,no-resolve");

    // IP 类广告
    if (CONFIG.enableAdBlock) {
        rules.push("RULE-SET,reject-ip,REJECT");
    }

    // 电报 / 流媒体的 IP 直连部分
    rules.push("RULE-SET,telegram-ip,✈️ 电报信息,no-resolve");
    rules.push("RULE-SET,stream-ip,📺 流媒体,no-resolve");

    // 国内 IP / 兜底
    rules.push("GEOIP,CN,🇨🇳 国内代理");
    rules.push("MATCH,🌍 国外代理");

    // 兜底过滤：目标不存在的规则（理论上不会有）在这里再兜一层
    params.rules = rules.filter(function (rule) {
        return isKnownPolicy(policyOf(rule));
    });

    // 规则集：domainset 目录用 domain，non_ip / ip 目录用 classical
    const providers = {
        lan: createProvider(CONFIG.rulesets.lan, "classical", "./rule_set/lan.txt"),
        "lan-ip": createProvider(CONFIG.rulesets.lanIp, "classical", "./rule_set/lan_ip.txt"),
        domestic: createProvider(CONFIG.rulesets.domestic, "classical", "./rule_set/domestic.txt"),
        "apple-cdn": createProvider(CONFIG.rulesets.appleCdn, "domain", "./rule_set/apple_cdn.txt"),
        "apple-cn": createProvider(CONFIG.rulesets.appleCn, "classical", "./rule_set/apple_cn.txt"),
        "microsoft-cdn": createProvider(CONFIG.rulesets.microsoftCdn, "classical", "./rule_set/microsoft_cdn.txt"),
        "apple-services": createProvider(CONFIG.rulesets.appleServices, "classical", "./rule_set/apple_services.txt"),
        "microsoft-services": createProvider(CONFIG.rulesets.microsoftServices, "classical", "./rule_set/microsoft.txt"),
        ai: createProvider(CONFIG.rulesets.ai, "classical", "./rule_set/ai.txt"),
        "telegram-domain": createProvider(CONFIG.rulesets.telegramDomain, "classical", "./rule_set/telegram.txt"),
        "telegram-ip": createProvider(CONFIG.rulesets.telegramIp, "classical", "./rule_set/telegram_ip.txt"),
        stream: createProvider(CONFIG.rulesets.stream, "classical", "./rule_set/stream.txt"),
        "stream-ip": createProvider(CONFIG.rulesets.streamIp, "classical", "./rule_set/stream_ip.txt"),
        direct: createProvider(CONFIG.rulesets.direct, "classical", "./rule_set/direct.txt"),
        "download-domainset": createProvider(CONFIG.rulesets.downloadDomainset, "domain", "./rule_set/download_domainset.txt"),
        download: createProvider(CONFIG.rulesets.download, "classical", "./rule_set/download.txt")
    };

    // 广告规则集只在开启去广告时生成
    if (CONFIG.enableAdBlock) {
        providers.ad = createProvider(CONFIG.rulesets.ad, "domain", "./rule_set/ad.txt");
        providers["reject-non-ip"] = createProvider(CONFIG.rulesets.rejectNonIp, "classical", "./rule_set/reject_non_ip.txt");
        providers["reject-drop"] = createProvider(CONFIG.rulesets.rejectDrop, "classical", "./rule_set/reject_drop.txt");
        providers["reject-no-drop"] = createProvider(CONFIG.rulesets.rejectNoDrop, "classical", "./rule_set/reject_no_drop.txt");
        providers["reject-ip"] = createProvider(CONFIG.rulesets.rejectIp, "classical", "./rule_set/reject_ip.txt");
    }

    params["rule-providers"] = providers;
}
