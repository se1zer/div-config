// Mihomo Party / Clash Party 覆写脚本（mihomo 内核）
// 设计前提：只使用 mixed-port 混合代理，不启用 TUN
// 能力：国外节点、国内节点各自有独立的手动选择组

// ==================== 用户自定义区（一般只改这一段） ====================

// 英文字母缩写前后不能紧跟其它字母：避免 Russia 命中 US、Ukraine 命中 UK/KR
function wordCode(code) {
    return `(?:^|[^A-Za-z])${code}(?:[^A-Za-z]|$)`;
}

var CONFIG = {
    // 是否生成「🇨🇳 国内代理」组
    // false = 国内域名 / IP 直接 DIRECT
    // true  = 国内域名 / IP 走「🇨🇳 国内代理」组（默认 DIRECT，可手动切到国内代理池）
    enableChinaProxy: false,

    // 只用这一个混合端口，订阅里自带的其它入站端口会被清掉
    mixedPort: 7890,
    allowLan: false,
    logLevel: "info",
    // 域名嗅探：只走混合端口时可以设为 false（域名规则依旧生效，只有"应用自己解析成 IP 再连"的场景受影响）
    sniffer: true,

    // 测速参数
    testUrl: "https://cp.cloudflare.com",
    testInterval: 300,
    tolerance: 50,
    loadBalanceStrategy: "consistent-hashing", // consistent-hashing / round-robin / sticky-sessions

    // DNS
    nameserver: ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"],
    proxyServerNameserver: ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"],
    defaultNameserver: ["223.5.5.5", "119.29.29.29"], // 必须为 IP，用于解析上面那些 DNS 域名

    // 公告 / 信息节点过滤词：命中就不参与分组
    excludeTerms: "剩余|到期|过期|官网|网址|地址|订阅|客服|发布|公告|流量|重置|试用|禁止|联系|邮箱|群组|频道|更新时间|过滤|条线路|线路数|个节点|条节点|套餐|倍率|已用|限速|通知|提醒",
    // 形如「过滤到14条线路」的信息节点
    infoNodeRegex: /\d+\s*(条|個|个)\s*(线路|節點|节点)/i,

    // 节点名里的国内关键词（省份 / 运营商）
    chinaKeywords: "中国|国内|电信|联通|移动|铁通|广电|教育网|黑龙江|吉林|辽宁|北京|天津|内蒙古|新疆|甘肃|宁夏|青海|陕西|山西|河北|河南|山东|江苏|上海|浙江|安徽|福建|江西|湖北|湖南|广东|广西|海南|四川|贵州|云南|重庆|西藏",

    // 节点名里的国家 / 地区关键词（新增地区照这个格式加一行）
    // 英文缩写用 wordCode() 包一层；不使用旗帜表情，纯旗帜命名的节点会落到「其它 - 自动选择」
    includeTerms: {
        HK: `(香港|Hong Kong|HongKong|${wordCode("HK")})`,
        MO: `(澳门|澳門|Macao|Macau|${wordCode("MO")})`,
        TW: `(台湾|台灣|Taiwan|${wordCode("TW")})`,
        SG: `(新加坡|狮城|Singapore|${wordCode("SG")})`,
        JP: `(日本|Japan|东京|大阪|${wordCode("JP")})`,
        KR: `(韩国|韓國|Korea|首尔|首爾|${wordCode("KR")})`,
        US: `(美国|美國|United States|America|洛杉矶|圣何塞|西雅图|纽约|达拉斯|硅谷|凤凰城|${wordCode("US")})`,
        UK: `(英国|英國|United Kingdom|Britain|伦敦|${wordCode("UK")})`,
        FR: `(法国|法國|France|巴黎|${wordCode("FR")})`,
        DE: `(德国|德國|Germany|法兰克福|${wordCode("DE")})`
    },

    // 自定义规则：优先级次于去广告规则、高于其它规则
    // 目标可以写策略组名、节点名，或 DIRECT / REJECT
    // 目标不存在时这条会被自动跳过（只在日志里警告），不会导致整份配置加载失败
    customRules: [
        "DOMAIN-SUFFIX,4399.cn,CSTEAM-VPN",
        "DOMAIN-SUFFIX,red.unicom,CSTEAM-VPN",
    ],

    // 自定义 DNS 分流域名写到 overwriteNameserverPolicy 里，hosts 写到 overwriteHosts 里
};

// ==================== 以下一般无需修改 ====================

var BUILTIN_POLICIES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];

function main(params) {

    overwriteBasicOptions(params);
    overwriteDns(params);
    overwriteFakeIpFilter(params);
    overwriteNameserverPolicy(params);
    overwriteHosts(params);
    const groups = overwriteProxyGroups(params);
    overwriteRules(params, groups);
    return params;
}

// 基础选项：端口、模式、日志、嗅探；只走混合端口，不开 TUN
function overwriteBasicOptions(params) {
    // 清掉订阅里可能自带的其它入站端口，避免多端口对外开放
    ["port", "socks-port", "redir-port", "tproxy-port", "listeners"].forEach((key) => {
        delete params[key];
    });

    const otherOptions = {
        "mixed-port": CONFIG.mixedPort,
        "allow-lan": CONFIG.allowLan,
        mode: "rule",
        "log-level": CONFIG.logLevel,
        ipv6: false,
        "find-process-mode": "off",
        profile: {
            "store-selected": true,
            "store-fake-ip": true,
        },
        "unified-delay": true,
        "tcp-concurrent": true,
        // 新版内核已移除 global-client-fingerprint，如需 TLS 指纹请在节点上设置 client-fingerprint
        sniffer: {
            enable: CONFIG.sniffer,
            "force-dns-mapping": true,
            "parse-pure-ip": true,
            sniff: {
                HTTP: {
                    ports: [80, "8080-8880"],
                    "override-destination": true,
                },
                TLS: {
                    ports: [443, 8443],
                },
                QUIC: {
                    ports: [443, 8443],
                },
            },
            "skip-domain": ["Mijia Cloud", "+.push.apple.com"]
        },
    };
    Object.keys(otherOptions).forEach((key) => {
        params[key] = otherOptions[key];
    });

    // 不使用 TUN（虚拟网卡），只走 CONFIG.mixedPort 混合端口
    params["tun"] = { enable: false };
}

// DNS 配置：Fake IP 模式、DNS 服务器
function overwriteDns(params) {
    const dnsList = CONFIG.nameserver;
    const proxyDnsList = CONFIG.proxyServerNameserver;

    const dnsOptions = {
        enable: true,
        // UDP 443 被限速/阻断的网络下 prefer-h3 会拖死解析，关闭更稳
        "prefer-h3": false,
        ipv6: false,
        "enhanced-mode": "fake-ip",
        "fake-ip-range": "198.18.0.1/16",
        "respect-rules": true,
        // 用于解析 nameserver / nameserver-policy 里的域名（必须为 IP）
        "default-nameserver": CONFIG.defaultNameserver,
        nameserver: dnsList,
        "proxy-server-nameserver": proxyDnsList,
    };
    params.dns = { ...dnsOptions };
}

// Fake IP 过滤器：这些域名不使用假 IP，返回真实 IP
function overwriteFakeIpFilter (params) {
    const fakeIpFilter = [
        "+.m2m",
        "+.injections.adguard.org",
        "+.local.adguard.org",
        "+.bogon",
        "+.lan",
        "+.localdomain",
        "+.home.arpa",
        "+.10.in-addr.arpa",
        "+.16.172.in-addr.arpa",
        "+.17.172.in-addr.arpa",
        "+.18.172.in-addr.arpa",
        "+.19.172.in-addr.arpa",
        "+.20.172.in-addr.arpa",
        "+.21.172.in-addr.arpa",
        "+.22.172.in-addr.arpa",
        "+.23.172.in-addr.arpa",
        "+.24.172.in-addr.arpa",
        "+.25.172.in-addr.arpa",
        "+.26.172.in-addr.arpa",
        "+.27.172.in-addr.arpa",
        "+.28.172.in-addr.arpa",
        "+.29.172.in-addr.arpa",
        "+.30.172.in-addr.arpa",
        "+.31.172.in-addr.arpa",
        "+.168.192.in-addr.arpa",
        "+.254.169.in-addr.arpa",
        "dns.msftncsi.com",
        "*.srv.nintendo.net",
        "*.stun.playstation.net",
        "xbox.*.microsoft.com",
        "*.xboxlive.com",
        "*.turn.twilio.com",
        "*.stun.twilio.com",
        "stun.syncthing.net",
        "stun.*"
    ];
    params.dns["fake-ip-filter"] = fakeIpFilter;
}

// DNS 分流策略：按域名指定 DNS 服务器
function overwriteNameserverPolicy (params) {
    const nameserverPolicy = {
        // DNS 服务器域名
        "dns.alidns.com": "quic://223.5.5.5:853",
        "doh.pub": "https://1.12.12.12/dns-query",
        "doh.360.cn": "101.198.198.198",
        // 阿里系域名
        "+.uc.cn": "quic://dns.alidns.com:853",
        "+.alibaba.com": "quic://dns.alidns.com:853",
        "*.alicdn.com": "quic://dns.alidns.com:853",
        "*.ialicdn.com": "quic://dns.alidns.com:853",
        "*.myalicdn.com": "quic://dns.alidns.com:853",
        "*.alidns.com": "quic://dns.alidns.com:853",
        "*.aliimg.com": "quic://dns.alidns.com:853",
        "+.aliyun.com": "quic://dns.alidns.com:853",
        "*.aliyuncs.com": "quic://dns.alidns.com:853",
        "*.alikunlun.com": "quic://dns.alidns.com:853",
        "*.alikunlun.net": "quic://dns.alidns.com:853",
        "*.cdngslb.com": "quic://dns.alidns.com:853",
        "+.alipay.com": "quic://dns.alidns.com:853",
        "+.alipay.cn": "quic://dns.alidns.com:853",
        "+.alipay.com.cn": "quic://dns.alidns.com:853",
        "*.alipayobjects.com": "quic://dns.alidns.com:853",
        "+.alibaba-inc.com": "quic://dns.alidns.com:853",
        "*.alibabausercontent.com": "quic://dns.alidns.com:853",
        "*.alibabadns.com": "quic://dns.alidns.com:853",
        "+.alibabachengdun.com": "quic://dns.alidns.com:853",
        "+.alicloudccp.com": "quic://dns.alidns.com:853",
        "+.alipan.com": "quic://dns.alidns.com:853",
        "+.aliyundrive.com": "quic://dns.alidns.com:853",
        "+.aliyundrive.net": "quic://dns.alidns.com:853",
        "+.cainiao.com": "quic://dns.alidns.com:853",
        "+.cainiao.com.cn": "quic://dns.alidns.com:853",
        "+.cainiaoyizhan.com": "quic://dns.alidns.com:853",
        "+.guoguo-app.com": "quic://dns.alidns.com:853",
        "+.etao.com": "quic://dns.alidns.com:853",
        "+.yitao.com": "quic://dns.alidns.com:853",
        "+.1688.com": "quic://dns.alidns.com:853",
        "+.amap.com": "quic://dns.alidns.com:853",
        "+.gaode.com": "quic://dns.alidns.com:853",
        "+.autonavi.com": "quic://dns.alidns.com:853",
        "+.dingtalk.com": "quic://dns.alidns.com:853",
        "+.mxhichina.com": "quic://dns.alidns.com:853",
        "+.soku.com": "quic://dns.alidns.com:853",
        "+.tb.cn": "quic://dns.alidns.com:853",
        "+.taobao.com": "quic://dns.alidns.com:853",
        "*.taobaocdn.com": "quic://dns.alidns.com:853",
        "*.tbcache.com": "quic://dns.alidns.com:853",
        "+.tmall.com": "quic://dns.alidns.com:853",
        "+.goofish.com": "quic://dns.alidns.com:853",
        "+.xiami.com": "quic://dns.alidns.com:853",
        "+.xiami.net": "quic://dns.alidns.com:853",
        "*.ykimg.com": "quic://dns.alidns.com:853",
        "+.youku.com": "quic://dns.alidns.com:853",
        "+.tudou.com": "quic://dns.alidns.com:853",
        "*.cibntv.net": "quic://dns.alidns.com:853",
        "+.ele.me": "quic://dns.alidns.com:853",
        "*.elemecdn.com": "quic://dns.alidns.com:853",
        "+.feizhu.com": "quic://dns.alidns.com:853",
        "+.taopiaopiao.com": "quic://dns.alidns.com:853",
        "+.fliggy.com": "quic://dns.alidns.com:853",
        "+.koubei.com": "quic://dns.alidns.com:853",
        "+.mybank.cn": "quic://dns.alidns.com:853",
        "+.mmstat.com": "quic://dns.alidns.com:853",
        "+.uczzd.cn": "quic://dns.alidns.com:853",
        "+.iconfont.cn": "quic://dns.alidns.com:853",
        "+.freshhema.com": "quic://dns.alidns.com:853",
        "+.hemamax.com": "quic://dns.alidns.com:853",
        "+.hemaos.com": "quic://dns.alidns.com:853",
        "+.hemashare.cn": "quic://dns.alidns.com:853",
        "+.shyhhema.com": "quic://dns.alidns.com:853",
        "+.sm.cn": "quic://dns.alidns.com:853",
        "+.npmmirror.com": "quic://dns.alidns.com:853",
        "+.alios.cn": "quic://dns.alidns.com:853",
        "+.wandoujia.com": "quic://dns.alidns.com:853",
        "+.aligames.com": "quic://dns.alidns.com:853",
        "+.25pp.com": "quic://dns.alidns.com:853",
        "*.aliapp.org": "quic://dns.alidns.com:853",
        "+.tanx.com": "quic://dns.alidns.com:853",
        "+.hellobike.com": "quic://dns.alidns.com:853",
        "*.hichina.com": "quic://dns.alidns.com:853",
        "*.yunos.com": "quic://dns.alidns.com:853",
        "*.nlark.com": "quic://dns.alidns.com:853",
        "*.yuque.com": "quic://dns.alidns.com:853",
        "upos-sz-mirrorali.bilivideo.com": "quic://dns.alidns.com:853",
        "upos-sz-estgoss.bilivideo.com": "quic://dns.alidns.com:853",
        "ali-safety-video.acfun.cn": "quic://dns.alidns.com:853",
        // 腾讯系域名
        "*.qcloud.com": "https://doh.pub/dns-query",
        "*.gtimg.cn": "https://doh.pub/dns-query",
        "*.gtimg.com": "https://doh.pub/dns-query",
        "*.gtimg.com.cn": "https://doh.pub/dns-query",
        "*.gdtimg.com": "https://doh.pub/dns-query",
        "*.idqqimg.com": "https://doh.pub/dns-query",
        "*.udqqimg.com": "https://doh.pub/dns-query",
        "*.igamecj.com": "https://doh.pub/dns-query",
        "+.myapp.com": "https://doh.pub/dns-query",
        "*.myqcloud.com": "https://doh.pub/dns-query",
        "+.dnspod.com": "https://doh.pub/dns-query",
        "*.qpic.cn": "https://doh.pub/dns-query",
        "*.qlogo.cn": "https://doh.pub/dns-query",
        "+.qq.com": "https://doh.pub/dns-query",
        "+.qq.com.cn": "https://doh.pub/dns-query",
        "*.qqmail.com": "https://doh.pub/dns-query",
        "+.qzone.com": "https://doh.pub/dns-query",
        "*.tencent-cloud.net": "https://doh.pub/dns-query",
        "*.tencent-cloud.com": "https://doh.pub/dns-query",
        "+.tencent.com": "https://doh.pub/dns-query",
        "+.tencent.com.cn": "https://doh.pub/dns-query",
        "+.tencentmusic.com": "https://doh.pub/dns-query",
        "+.weixinbridge.com": "https://doh.pub/dns-query",
        "+.weixin.com": "https://doh.pub/dns-query",
        "+.weiyun.com": "https://doh.pub/dns-query",
        "+.soso.com": "https://doh.pub/dns-query",
        "+.sogo.com": "https://doh.pub/dns-query",
        "+.sogou.com": "https://doh.pub/dns-query",
        "*.sogoucdn.com": "https://doh.pub/dns-query",
        "*.roblox.cn": "https://doh.pub/dns-query",
        "+.robloxdev.cn": "https://doh.pub/dns-query",
        "+.wegame.com": "https://doh.pub/dns-query",
        "+.wegame.com.cn": "https://doh.pub/dns-query",
        "+.wegameplus.com": "https://doh.pub/dns-query",
        "+.cdn-go.cn": "https://doh.pub/dns-query",
        "*.tencentcs.cn": "https://doh.pub/dns-query",
        "*.qcloudimg.com": "https://doh.pub/dns-query",
        "+.dnspod.cn": "https://doh.pub/dns-query",
        "+.anticheatexpert.com": "https://doh.pub/dns-query",
        "url.cn": "https://doh.pub/dns-query",
        "*.qlivecdn.com": "https://doh.pub/dns-query",
        "*.tcdnlive.com": "https://doh.pub/dns-query",
        "*.dnsv1.com": "https://doh.pub/dns-query",
        "*.smtcdns.net": "https://doh.pub/dns-query",
        "+.coding.net": "https://doh.pub/dns-query",
        "*.codehub.cn": "https://doh.pub/dns-query",
        "tx-safety-video.acfun.cn": "https://doh.pub/dns-query",
        "acg.tv": "https://doh.pub/dns-query",
        "b23.tv": "https://doh.pub/dns-query",
        "+.bilibili.cn": "https://doh.pub/dns-query",
        "+.bilibili.com": "https://doh.pub/dns-query",
        "*.acgvideo.com": "https://doh.pub/dns-query",
        "*.bilivideo.com": "https://doh.pub/dns-query",
        "*.bilivideo.cn": "https://doh.pub/dns-query",
        "*.bilivideo.net": "https://doh.pub/dns-query",
        "*.hdslb.com": "https://doh.pub/dns-query",
        "*.biliimg.com": "https://doh.pub/dns-query",
        "*.biliapi.com": "https://doh.pub/dns-query",
        "*.biliapi.net": "https://doh.pub/dns-query",
        "+.biligame.com": "https://doh.pub/dns-query",
        "*.biligame.net": "https://doh.pub/dns-query",
        "+.bilicomic.com": "https://doh.pub/dns-query",
        "+.bilicomics.com": "https://doh.pub/dns-query",
        "*.bilicdn1.com": "https://doh.pub/dns-query",
        "+.mi.com": "https://doh.pub/dns-query",
        "+.duokan.com": "https://doh.pub/dns-query",
        "*.mi-img.com": "https://doh.pub/dns-query",
        "*.mi-idc.com": "https://doh.pub/dns-query",
        "*.xiaoaisound.com": "https://doh.pub/dns-query",
        "*.xiaomixiaoai.com": "https://doh.pub/dns-query",
        "*.mi-fds.com": "https://doh.pub/dns-query",
        "*.mifile.cn": "https://doh.pub/dns-query",
        "*.mijia.tech": "https://doh.pub/dns-query",
        "+.miui.com": "https://doh.pub/dns-query",
        "+.xiaomi.com": "https://doh.pub/dns-query",
        "+.xiaomi.cn": "https://doh.pub/dns-query",
        "+.xiaomi.net": "https://doh.pub/dns-query",
        "+.xiaomiev.com": "https://doh.pub/dns-query",
        "+.xiaomiyoupin.com": "https://doh.pub/dns-query",
        // 字节系域名
        "+.bytedance.com": "180.184.2.2",
        "*.bytecdn.cn": "180.184.2.2",
        "*.volccdn.com": "180.184.2.2",
        "*.toutiaoimg.com": "180.184.2.2",
        "*.toutiaoimg.cn": "180.184.2.2",
        "*.toutiaostatic.com": "180.184.2.2",
        "*.toutiaovod.com": "180.184.2.2",
        "*.toutiaocloud.com": "180.184.2.2",
        "+.toutiaopage.com": "180.184.2.2",
        "+.feiliao.com": "180.184.2.2",
        "+.iesdouyin.com": "180.184.2.2",
        "*.pstatp.com": "180.184.2.2",
        "+.snssdk.com": "180.184.2.2",
        "*.bytegoofy.com": "180.184.2.2",
        "+.toutiao.com": "180.184.2.2",
        "+.feishu.cn": "180.184.2.2",
        "+.feishu.net": "180.184.2.2",
        "*.feishucdn.com": "180.184.2.2",
        "*.feishupkg.com": "180.184.2.2",
        "+.douyin.com": "180.184.2.2",
        "*.douyinpic.com": "180.184.2.2",
        "*.douyinstatic.com": "180.184.2.2",
        "*.douyincdn.com": "180.184.2.2",
        "*.douyinliving.com": "180.184.2.2",
        "*.douyinvod.com": "180.184.2.2",
        "+.huoshan.com": "180.184.2.2",
        "*.huoshanstatic.com": "180.184.2.2",
        "+.huoshanzhibo.com": "180.184.2.2",
        "+.ixigua.com": "180.184.2.2",
        "*.ixiguavideo.com": "180.184.2.2",
        "*.ixgvideo.com": "180.184.2.2",
        "*.byted-static.com": "180.184.2.2",
        "+.volces.com": "180.184.2.2",
        "+.baike.com": "180.184.2.2",
        "*.zjcdn.com": "180.184.2.2",
        "*.zijieapi.com": "180.184.2.2",
        "+.feelgood.cn": "180.184.2.2",
        "*.bytetcc.com": "180.184.2.2",
        "*.bytednsdoc.com": "180.184.2.2",
        "*.byteimg.com": "180.184.2.2",
        "*.byteacctimg.com": "180.184.2.2",
        "*.ibytedapm.com": "180.184.2.2",
        "+.oceanengine.com": "180.184.2.2",
        "*.edge-byted.com": "180.184.2.2",
        "*.volcvideo.com": "180.184.2.2",
        // 百度系域名
        "+.91.com": "180.76.76.76",
        "+.hao123.com": "180.76.76.76",
        "+.baidu.cn": "180.76.76.76",
        "+.baidu.com": "180.76.76.76",
        "+.iqiyi.com": "180.76.76.76",
        "*.iqiyipic.com": "180.76.76.76",
        "*.baidubce.com": "180.76.76.76",
        "*.bcelive.com": "180.76.76.76",
        "*.baiducontent.com": "180.76.76.76",
        "*.baidustatic.com": "180.76.76.76",
        "*.bdstatic.com": "180.76.76.76",
        "*.bdimg.com": "180.76.76.76",
        "*.bcebos.com": "180.76.76.76",
        "*.baidupcs.com": "180.76.76.76",
        "*.baidubcr.com": "180.76.76.76",
        "*.yunjiasu-cdn.net": "180.76.76.76",
        "+.tieba.com": "180.76.76.76",
        "+.xiaodutv.com": "180.76.76.76",
        "*.shifen.com": "180.76.76.76",
        "*.jomodns.com": "180.76.76.76",
        "*.bdydns.com": "180.76.76.76",
        "*.jomoxc.com": "180.76.76.76",
        "*.duapp.com": "180.76.76.76",
        "*.antpcdn.com": "180.76.76.76",
        "upos-sz-mirrorbd.bilivideo.com": "180.76.76.76",
        "upos-sz-mirrorbos.bilivideo.com": "180.76.76.76",
        // 360 系域名
        "*.qhimg.com": "https://doh.360.cn/dns-query",
        "*.qhimgs.com": "https://doh.360.cn/dns-query",
        "*.qhres.com": "https://doh.360.cn/dns-query",
        "*.qhres2.com": "https://doh.360.cn/dns-query",
        "*.qhmsg.com": "https://doh.360.cn/dns-query",
        "*.qhstatic.com": "https://doh.360.cn/dns-query",
        "*.qhupdate.com": "https://doh.360.cn/dns-query",
        "*.qihucdn.com": "https://doh.360.cn/dns-query",
        "+.360.com": "https://doh.360.cn/dns-query",
        "+.360.cn": "https://doh.360.cn/dns-query",
        "+.360.net": "https://doh.360.cn/dns-query",
        "+.360safe.com": "https://doh.360.cn/dns-query",
        "*.360tpcdn.com": "https://doh.360.cn/dns-query",
        "+.360os.com": "https://doh.360.cn/dns-query",
        "*.360webcache.com": "https://doh.360.cn/dns-query",
        "+.360kuai.com": "https://doh.360.cn/dns-query",
        "+.so.com": "https://doh.360.cn/dns-query",
        "+.haosou.com": "https://doh.360.cn/dns-query",
        "+.yunpan.cn": "https://doh.360.cn/dns-query",
        "+.yunpan.com": "https://doh.360.cn/dns-query",
        "+.yunpan.com.cn": "https://doh.360.cn/dns-query",
        "*.qh-cdn.com": "https://doh.360.cn/dns-query",
        "+.baomitu.com": "https://doh.360.cn/dns-query",
        "+.qiku.com": "https://doh.360.cn/dns-query",
        // 路由器/局域网域名
        "+.securelogin.com.cn": ['system://', 'system', 'dhcp://system'],
        "captive.apple.com": ['system://', 'system', 'dhcp://system'],
        "hotspot.cslwifi.com": ['system://', 'system', 'dhcp://system'],
        "*.m2m": ['system://', 'system', 'dhcp://system'],
        "injections.adguard.org": ['system://', 'system', 'dhcp://system'],
        "local.adguard.org": ['system://', 'system', 'dhcp://system'],
        "*.bogon": ['system://', 'system', 'dhcp://system'],
        "*.home": ['system://', 'system', 'dhcp://system'],
        "instant.arubanetworks.com": ['system://', 'system', 'dhcp://system'],
        "setmeup.arubanetworks.com": ['system://', 'system', 'dhcp://system'],
        "router.asus.com": ['system://', 'system', 'dhcp://system'],
        "repeater.asus.com": ['system://', 'system', 'dhcp://system'],
        "+.asusrouter.com": ['system://', 'system', 'dhcp://system'],
        "+.routerlogin.net": ['system://', 'system', 'dhcp://system'],
        "+.routerlogin.com": ['system://', 'system', 'dhcp://system'],
        "+.tplinkwifi.net": ['system://', 'system', 'dhcp://system'],
        "+.tplogin.cn": ['system://', 'system', 'dhcp://system'],
        "+.tplinkap.net": ['system://', 'system', 'dhcp://system'],
        "+.tplinkmodem.net": ['system://', 'system', 'dhcp://system'],
        "+.tplinkplclogin.net": ['system://', 'system', 'dhcp://system'],
        "+.tplinkrepeater.net": ['system://', 'system', 'dhcp://system'],
        "*.ui.direct": ['system://', 'system', 'dhcp://system'],
        "unifi": ['system://', 'system', 'dhcp://system'],
        "*.huaweimobilewifi.com": ['system://', 'system', 'dhcp://system'],
        "*.router": ['system://', 'system', 'dhcp://system'],
        "aterm.me": ['system://', 'system', 'dhcp://system'],
        "console.gl-inet.com": ['system://', 'system', 'dhcp://system'],
        "homerouter.cpe": ['system://', 'system', 'dhcp://system'],
        "mobile.hotspot": ['system://', 'system', 'dhcp://system'],
        "ntt.setup": ['system://', 'system', 'dhcp://system'],
        "pi.hole": ['system://', 'system', 'dhcp://system'],
        "*.plex.direct": ['system://', 'system', 'dhcp://system'],
        "*.lan": ['system://', 'system', 'dhcp://system'],
        "*.localdomain": ['system://', 'system', 'dhcp://system'],
        "+.home.arpa": ['system://', 'system', 'dhcp://system'],
        "+.10.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.16.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.17.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.18.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.19.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.20.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.21.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.22.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.23.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.24.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.25.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.26.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.27.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.28.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.29.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.30.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.31.172.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.168.192.in-addr.arpa": ['system://', 'system', 'dhcp://system'],
        "+.254.169.in-addr.arpa": ['system://', 'system', 'dhcp://system']
    };
    params.dns["nameserver-policy"] = nameserverPolicy;
}

// Hosts 映射：DNS 服务器域名的静态 IP（避免 DNS 循环）
function overwriteHosts (params) {
    const hosts = {
        "dns.alidns.com": ['223.5.5.5', '223.6.6.6', '2400:3200:baba::1', '2400:3200::1'],
        "doh.pub": ['120.53.53.53', '1.12.12.12'],
        "cdn.jsdelivr.net": ['cdn.jsdelivr.net.cdn.cloudflare.net']
    };
    params.hosts = hosts;
}

// 代理组：国外 / 国内节点分别可手动选择
function overwriteProxyGroups(params) {
    const allProxies = (params["proxies"] || []).map((e) => e.name);

    // 关键词、过滤词、测速参数都来自文件顶部的 CONFIG
    const { excludeTerms, chinaKeywords, includeTerms } = CONFIG;
    const allCountryTerms = Object.values(includeTerms).join("|");

    // 参与分组的节点（剔除公告节点）
    const excludeRe = new RegExp(excludeTerms, "i");
    const validProxies = allProxies.filter(
        (name) => !excludeRe.test(name) && !CONFIG.infoNodeRegex.test(name)
    );

    // 国内池：带省份 / 运营商关键词，且不是港澳台或境外节点
    const chinaRe = new RegExp(
        `^(?=.*(?:${chinaKeywords}))(?!.*(?:${allCountryTerms}|${excludeTerms})).*$`,
        "i"
    );
    const chinaProxies = validProxies.filter((name) => chinaRe.test(name));
    // 国外池：国内池之外的其余节点（含 IEPL 专线等没有国家关键词的节点）
    // 无国内代理版里没有国内池可用，全部节点都放进国外池
    const foreignProxies = CONFIG.enableChinaProxy
        ? validProxies.filter((name) => !chinaRe.test(name))
        : validProxies;

    // 国家 / 地区自动选择组（没有对应节点就不生成，避免空组和规则悬空）
    const autoProxyGroups = Object.keys(includeTerms)
        .map((code) => {
            const re = new RegExp(`^(?=.*${includeTerms[code]})(?!.*(?:${excludeTerms})).*$`, "i");
            return {
                name: `${code} - 自动选择`,
                type: "url-test",
                url: CONFIG.testUrl,
                interval: CONFIG.testInterval,
                tolerance: CONFIG.tolerance,
                hidden: true,
                proxies: validProxies.filter((name) => re.test(name)),
            };
        })
        .filter((item) => item.proxies.length > 0);

    // 其它：既没有国家关键词、也不属于国内池的节点
    const otherRe = new RegExp(
        `^(?!.*(?:${allCountryTerms}|${chinaKeywords}|${excludeTerms})).*$`,
        "i"
    );
    const otherProxies = validProxies.filter((name) => otherRe.test(name));
    if (otherProxies.length > 0) {
        autoProxyGroups.push({
            name: "其它 - 自动选择",
            type: "url-test",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            tolerance: CONFIG.tolerance,
            hidden: true,
            proxies: otherProxies,
        });
    }

    const autoGroupNames = autoProxyGroups.map((item) => item.name);
    const hasForeign = foreignProxies.length > 0;
    const hasChina = CONFIG.enableChinaProxy && chinaProxies.length > 0;
    const icon = (name) => `https://raw.githubusercontent.com/Orz-3/mini/master/Color/${name}.png`;

    const groups = [];

    // 国外主入口
    const foreignEntry = [];
    if (hasForeign) {
        foreignEntry.push("🇺🇳 国外自动选择", "🇺🇳 国外手动选择", "⚖️ 国外负载均衡");
    }
    foreignEntry.push("DIRECT");
    groups.push({
        name: "🌍 国外代理",
        type: "select",
        url: CONFIG.testUrl,
        icon: icon("Static"),
        proxies: foreignEntry,
    });

    // 国内主入口：默认 DIRECT，需要时手动切到国内代理池（无国内代理版不生成）
    if (CONFIG.enableChinaProxy) {
        groups.push({
            name: "🇨🇳 国内代理",
            type: "select",
            icon: icon("China"),
            proxies: hasChina ? ["DIRECT", "🇨🇳 国内手动选择"] : ["DIRECT"],
        });
    }

    if (hasForeign) {
        groups.push({
            name: "🇺🇳 国外自动选择",
            type: "select",
            icon: icon("Urltest"),
            proxies: ["ALL - 国外自动选择", ...autoGroupNames],
        });
        groups.push({
            name: "🇺🇳 国外手动选择",
            type: "select",
            icon: icon("Cylink"),
            proxies: foreignProxies,
        });
    }

    if (hasChina) {
        groups.push({
            name: "🇨🇳 国内手动选择",
            type: "select",
            icon: icon("China"),
            proxies: chinaProxies,
        });
    }

    if (hasForeign) {
        groups.push({
            name: "⚖️ 国外负载均衡",
            type: "load-balance",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            strategy: CONFIG.loadBalanceStrategy,
            proxies: foreignProxies,
            icon: icon("Available"),
        });
        groups.push({
            name: "ALL - 国外自动选择",
            type: "url-test",
            url: CONFIG.testUrl,
            interval: CONFIG.testInterval,
            tolerance: CONFIG.tolerance,
            proxies: foreignProxies,
            hidden: true,
        });
    }

    groups.push(...autoProxyGroups);

    // 业务分组：默认走国外入口，可切到任意国家 / 地区自动选择
    const serviceProxies = [...new Set(["🌍 国外代理", ...autoGroupNames])];
    groups.push({
        name: "✈️ 电报信息",
        type: "select",
        proxies: serviceProxies,
        icon: icon("Telegram"),
    });
    groups.push({
        name: "🤖 AIGC",
        type: "select",
        proxies: autoGroupNames.includes("US - 自动选择")
            ? ["US - 自动选择", ...serviceProxies.filter((name) => name !== "US - 自动选择")]
            : serviceProxies,
        icon: icon("OpenAI"),
    });
    groups.push({
        name: "🍎 苹果服务",
        type: "select",
        proxies: ["DIRECT", ...serviceProxies],
        icon: icon("Apple"),
    });
    groups.push({
        name: "Ⓜ️ 微软服务",
        type: "select",
        proxies: ["DIRECT", ...serviceProxies],
        icon: icon("Microsoft"),
    });

    params["proxy-groups"] = groups;
    return groups;
}

// 分流规则：流量走向
// groups 由 overwriteProxyGroups 返回，用来判断哪些策略组真的存在
function overwriteRules(params, groups) {
    const groupNames = new Set((groups || []).map((item) => item.name));
    const proxyNames = new Set((params["proxies"] || []).map((e) => e.name));
    // 没有美国节点时，流媒体规则回落到国外主入口
    const streamPolicy = groupNames.has("US - 自动选择") ? "US - 自动选择" : "🌍 国外代理";
    // 没有国内代理组时，国内流量直接 DIRECT
    const domesticTarget = groupNames.has("🇨🇳 国内代理") ? "🇨🇳 国内代理" : "DIRECT";

    // 去广告规则（最高优先级）
    const adNonipRules = [
        "RULE-SET,reject_non_ip,REJECT",
        "RULE-SET,reject_domainset,REJECT",
        "RULE-SET,reject_non_ip_drop,REJECT-DROP",
        "RULE-SET,reject_non_ip_no_drop,REJECT"
    ];

    // 自定义规则写在文件顶部的 CONFIG.customRules 里
    const customRules = CONFIG.customRules;

    // 校验自定义规则的策略是否存在：订阅变动时不要让整份配置加载失败
    const validCustomRules = customRules.filter((rule) => {
        const policy = rule.split(",").pop().trim();
        if (groupNames.has(policy) || proxyNames.has(policy) || BUILTIN_POLICIES.includes(policy)) {
            return true;
        }
        console.warn(`[proxyrules] 自定义规则引用的策略 "${policy}" 不存在，已跳过：${rule}`);
        return false;
    });

    // 非 IP 类规则：先具体服务，再 direct / domestic，最后 cdn / global
    const nonipRules = [
        // 局域网
        "RULE-SET,lan_non_ip,DIRECT",
        // 流媒体
        `RULE-SET,stream_non_ip,${streamPolicy}`,
        // Telegram
        "RULE-SET,telegram_non_ip,✈️ 电报信息",
        // Apple 服务
        "RULE-SET,apple_cdn,DIRECT",
        "RULE-SET,apple_cn_non_ip,DIRECT",
        "RULE-SET,apple_services,🍎 苹果服务",
        // Microsoft 服务
        "RULE-SET,microsoft_cdn_non_ip,DIRECT",
        "RULE-SET,microsoft_non_ip,Ⓜ️ 微软服务",
        // AIGC
        "RULE-SET,ai_non_ip,🤖 AIGC",
        // 下载
        "RULE-SET,download_domainset,🌍 国外代理",
        "RULE-SET,download_non_ip,🌍 国外代理",
        // 强制直连
        "RULE-SET,direct_non_ip,DIRECT",
        // 国内服务
        `RULE-SET,domestic_non_ip,${domesticTarget}`,
        // CDN 加速：放在具体服务之后，避免抢走 AIGC / Apple / Microsoft / Telegram 的 CDN 域名
        "RULE-SET,cdn_domainset,🌍 国外代理",
        "RULE-SET,cdn_non_ip,🌍 国外代理",
        // 全球服务
        "RULE-SET,global_non_ip,🌍 国外代理"
    ];

    // IP 类规则（按优先级排序）
    const ipRules = [
        // 去广告
        "RULE-SET,reject_ip,REJECT",
        // Telegram
        "RULE-SET,telegram_ip,✈️ 电报信息",
        // 流媒体
        `RULE-SET,stream_ip,${streamPolicy}`,
        // 局域网
        "RULE-SET,lan_ip,DIRECT",
        // 国内 IP：有国内代理组时走该组，否则 DIRECT
        `RULE-SET,domestic_ip,${domesticTarget}`,
        // 中国 IP
        `RULE-SET,china_ip,${domesticTarget}`,
        // 兜底规则
        "MATCH,🌍 国外代理"
    ];

    // 合并所有规则
    const rules = [
        ...adNonipRules,
        ...validCustomRules,
        ...nonipRules,
        ...ipRules
    ];

    // 规则源配置
    const ruleProviders = {
        // 去广告
        reject_non_ip_no_drop: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/reject-no-drop.txt",
            path: "./rule_set/sukkaw_ruleset/reject_non_ip_no_drop.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        reject_non_ip_drop: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/reject-drop.txt",
            path: "./rule_set/sukkaw_ruleset/reject_non_ip_drop.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        reject_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/reject.txt",
            path: "./rule_set/sukkaw_ruleset/reject_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        reject_domainset: {
            type: "http",
            behavior: "domain",
            url: "https://ruleset.skk.moe/Clash/domainset/reject.txt",
            path: "./rule_set/sukkaw_ruleset/reject_domainset.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        reject_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/ip/reject.txt",
            path: "./rule_set/sukkaw_ruleset/reject_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // CDN 加速
        cdn_domainset: {
            type: "http",
            behavior: "domain",
            url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
            path: "./rule_set/sukkaw_ruleset/cdn_domainset.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        cdn_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
            path: "./rule_set/sukkaw_ruleset/cdn_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // 流媒体
        stream_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/stream.txt",
            path: "./rule_set/sukkaw_ruleset/stream_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        stream_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/ip/stream.txt",
            path: "./rule_set/sukkaw_ruleset/stream_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // AIGC
        ai_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/ai.txt",
            path: "./rule_set/sukkaw_ruleset/ai_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // telegram
        telegram_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/telegram.txt",
            path: "./rule_set/sukkaw_ruleset/telegram_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        telegram_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/ip/telegram.txt",
            path: "./rule_set/sukkaw_ruleset/telegram_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // Apple 服务
        apple_cdn: {
            type: "http",
            behavior: "domain",
            url: "https://ruleset.skk.moe/Clash/domainset/apple_cdn.txt",
            path: "./rule_set/sukkaw_ruleset/apple_cdn.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        apple_services: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/apple_services.txt",
            path: "./rule_set/sukkaw_ruleset/apple_services.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        apple_cn_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/apple_cn.txt",
            path: "./rule_set/sukkaw_ruleset/apple_cn_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // Microsoft 服务
        microsoft_cdn_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt",
            path: "./rule_set/sukkaw_ruleset/microsoft_cdn_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        microsoft_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/microsoft.txt",
            path: "./rule_set/sukkaw_ruleset/microsoft_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // 下载
        download_domainset: {
            type: "http",
            behavior: "domain",
            url: "https://ruleset.skk.moe/Clash/domainset/download.txt",
            path: "./rule_set/sukkaw_ruleset/download_domainset.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        download_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/download.txt",
            path: "./rule_set/sukkaw_ruleset/download_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        // 局域网
        lan_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/lan.txt",
            path: "./rule_set/sukkaw_ruleset/lan_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        lan_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/ip/lan.txt",
            path: "./rule_set/sukkaw_ruleset/lan_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        domestic_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/domestic.txt",
            path: "./rule_set/sukkaw_ruleset/domestic_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        direct_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/direct.txt",
            path: "./rule_set/sukkaw_ruleset/direct_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        global_non_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/non_ip/global.txt",
            path: "./rule_set/sukkaw_ruleset/global_non_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        domestic_ip: {
            type: "http",
            behavior: "classical",
            url: "https://ruleset.skk.moe/Clash/ip/domestic.txt",
            path: "./rule_set/sukkaw_ruleset/domestic_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        },
        china_ip: {
            type: "http",
            behavior: "ipcidr",
            url: "https://ruleset.skk.moe/Clash/ip/china_ip.txt",
            path: "./rule_set/sukkaw_ruleset/china_ip.txt",
            interval: 43200,
            format: "text",
            proxy: "🌍 国外代理"
        }
    };

    params["rule-providers"] = ruleProviders;
    params["rules"] = rules;
}
