# Proxyrules

Clash Party（原名 Mihomo Party）覆写脚本。所有分组图标统一使用 [Orz-3/mini](https://github.com/Orz-3/mini) 的 Color 图标集（含国家 / 地区国旗）。用图片而不是 emoji，避免 Windows 上国旗 emoji 不显示。国外节点按国家分组，国内节点单独一组，AI / 电报单独分流。

## 它做什么

1. 只开 `CONFIG.port`（默认 7890）混合端口
2. 设置国内 DNS（fake-ip + 阿里/腾讯 DoH）
3. 国外节点按国家切分，国内节点单独一组
4. 规则：去广告 → AI → 电报 → 流媒体 → 国内直连 → 其它走代理

## 用法

1. Clash Party → 覆写 → 导入 `script.js`
2. TUN（虚拟网卡）保持关闭
3. 代理端口与 `CONFIG.port` 一致

## 分组

| 组 | 类型 | 说明 |
|---|---|---|
| 国外代理 | select | 国外流量主入口：国外自动选择 / 国外手动选择 / 国外负载均衡 / DIRECT |
| 国内代理 | select | 默认 DIRECT，可切到国内手动选择 |
| 国外自动选择 | select | `ALL - 国外自动选择` + 各国自动选择组（香港 / 日本 / 美国 …） |
| 国外手动选择 | select | 所有国外节点 |
| ALL - 国外自动选择 | url-test（隐藏） | 所有国外节点测速 |
| 国内手动选择 | select | 国内节点（没有就不生成） |
| 香港 / 澳门 / 台湾 / 新加坡 / 日本 / 韩国 / 美国 / 英国 / 法国 / 德国 - 自动选择 | url-test（隐藏） | 按节点名归类，没有对应节点就不生成。组名中文，图标用 Orz-3 的国旗图片 |
| 其它 - 自动选择 | url-test（隐藏） | 没有国家关键词、也不属于国内的节点 |
| AIGC | select | 默认 `美国 - 自动选择`，可切到任意地区组 |
| 流媒体 | select | 默认 `美国 - 自动选择`，可切到任意地区组 |
| 电报信息 | select | 默认「国外代理」，可切到任意地区组 |
| 苹果服务 | select | 默认 DIRECT，登录美区 Apple ID 时切到美国节点 |
| 微软服务 | select | 默认 DIRECT，可切到国外代理或任意地区组 |
| 国外负载均衡 | load-balance（隐藏） | 所有国外节点，按域名一致性哈希分配。不出现在分组列表，但作为「国外代理」的选项可选 |

## 规则

```yaml
# 域名类（在前，域名请求命中就结束，不用先做 IP 解析）
RULE-SET,ad,REJECT                    去广告 14.5 万条域名
# CONFIG.customRules 里的自定义规则插在这里
RULE-SET,reject-non-ip,REJECT         广告：domainset 覆盖不到的 keyword / wildcard / IP
RULE-SET,reject-drop,REJECT-DROP      广告：QUIC 类静默丢弃
RULE-SET,reject-no-drop,REJECT        广告：PCDN 吸血域名（p2p.qq.com、pcdn.yximgs.com 等）
RULE-SET,lan,DIRECT                   局域网域名（路由器 / NAS / 打印机）
RULE-SET,domestic,国内代理            国内域名
RULE-SET,apple-cdn,DIRECT             苹果 CDN
RULE-SET,apple-cn,DIRECT              苹果国内域名
RULE-SET,apple-services,苹果服务      苹果服务（iCloud / App Store / News）
RULE-SET,microsoft-cdn,DIRECT         微软 CDN（系统更新 / Office）
RULE-SET,microsoft-services,微软服务  微软服务（Outlook / Office / Bing / Azure）
RULE-SET,ai,AIGC                      AI
RULE-SET,telegram-domain,电报信息     电报域名
RULE-SET,stream,流媒体                流媒体域名
RULE-SET,direct,DIRECT                强制直连（银行 / 政务 / 内网）
RULE-SET,download-domainset,国外代理  大文件下载
RULE-SET,download,国外代理            大文件下载（通配）
# IP 类（在后）
RULE-SET,lan-ip,DIRECT,no-resolve     私网 / 回环（127.0.0.1、192.168.x.x 等）
RULE-SET,reject-ip,REJECT             广告：IP 直连
RULE-SET,telegram-ip,电报信息,no-resolve 电报 IP
RULE-SET,stream-ip,流媒体,no-resolve  流媒体 IP
GEOIP,CN,国内代理                     国内 IP
MATCH,国外代理                        兜底
```

`enableAdBlock: false` 时，`ad` / `reject-non-ip` / `reject-drop` / `reject-no-drop` / `reject-ip` 五个规则集和对应 5 条规则都不生成。

`lan-ip` 规则集（`ip/lan.txt`，12 条）负责私网 / 回环 / 组播直连：`127.0.0.1` 和 `192.168.x.x` 这类地址走代理一定失败。

## 规则集（21 个，从 ruleset.skk.moe 拉取，12 小时更新）

| 规则集 | behavior | 条数 | 作用 |
|---|---|---|---|
| `domainset/reject.txt` | domain | 145,537 | 广告域名 |
| `ip/reject.txt` | classical | 782 | 广告 IP |
| `non_ip/reject.txt` | classical | 371 | 广告 keyword / wildcard / IP |
| `non_ip/reject-drop.txt` | classical | 29 | 广告 QUIC 丢包 |
| `non_ip/reject-no-drop.txt` | classical | 45 | PCDN 吸血域名 |
| `non_ip/lan.txt` | classical | 50 | 局域网域名 |
| `ip/lan.txt` | classical | 12 | 私网 / 回环 IP 段 |
| `non_ip/domestic.txt` | classical | 870 | 国内域名 |
| `domainset/apple_cdn.txt` | domain | 160 | 苹果 CDN |
| `non_ip/apple_cn.txt` | classical | 10 | 苹果国内域名 |
| `non_ip/apple_services.txt` | classical | 26 | 苹果服务 |
| `non_ip/microsoft_cdn.txt` | classical | 51 | 微软 CDN |
| `non_ip/microsoft.txt` | classical | 84 | 微软服务 |
| `non_ip/direct.txt` | classical | 219 | 强制直连 |
| `domainset/download.txt` | domain | 1,969 | 大文件下载 |
| `non_ip/download.txt` | classical | 10 | 大文件下载（通配） |
| `non_ip/ai.txt` | classical | 55 | AI |
| `non_ip/telegram.txt` | classical | 15 | 电报域名 |
| `ip/telegram.txt` | classical | 15 | 电报 IP |
| `non_ip/stream.txt` | classical | 287 | 流媒体域名 |
| `ip/stream.txt` | classical | 20 | 流媒体 IP |

`domainset/` 下是纯域名，behavior 必须写 `domain`；`non_ip/` 和 `ip/` 下带规则前缀，写 `classical`。写错会加载不出规则。

## 设置（文件开头的 CONFIG）

| 键 | 默认值 | 说明 |
|---|---|---|
| `port` | `7890` | 混合代理端口 |
| `enableAdBlock` | `true` | 是否去广告 |
| `customRules` | 4399 / red.unicom | 自定义规则，插在去广告之后、AI 之前。目标可写策略组名、节点名或 DIRECT / REJECT；目标不存在时这条会被跳过 |
| `testUrl` / `testInterval` / `tolerance` | cloudflare / 300 / 50 | 自动选择的测速地址、间隔（秒）、容差（毫秒） |
| `chinaKeywords` | 省份 + 运营商 + 中国 | 节点名命中则归为国内节点 |
| `infoNodeKeywords` | 剩余 / 到期 / 套餐… | 机场公告节点，命中则忽略 |
| `regions` | HK / MO / TW / SG / JP / KR / US / UK / FR / DE | 国家关键词。英文缩写用 `wordCode()` 包一层，避免 `Russia` 命中 `US` |
| `rulesets` | skk 的 21 个规则集 | 广告 / 局域网 / 国内 / 苹果微软 CDN / 强制直连 / 下载 / AI / 电报 / 流媒体，见下面「规则集」表格 |

## 几点说明

- **脚本不删除订阅里的其它键**。订阅如果自带 `port`、`socks-port`、`listeners`、`tun.enable: true`，这些都会原样保留。需要强制关掉时自己补一行，例如：
  ```js
  params.tun = { enable: false };
  delete params["socks-port"];
  ```
- **不写 `profile` / `unified-delay` / `find-process-mode`**。它们的默认值分别是 `store-selected: true`、`false`、`strict`，已经符合预期，显式写是冗余。
- **手动选择的节点会被记住**（默认 `store-selected: true`），重载配置不会丢。
- **流媒体只匹配域名**（skk 的 `non_ip/stream.txt`）。流媒体走 IP 直连的那部分流量会落到 `MATCH` → 「国外代理」，此时在「流媒体」里选的节点对它不生效。需要覆盖的话再加一个 `ip/stream.txt` 规则集。
- **规则集格式要对上**：`domainset/` 下是纯域名列表，`behavior` 必须写 `domain`；`non_ip/` 和 `ip/` 下是带前缀的规则，`behavior` 写 `classical`。写错规则集加载不出来。
- **第一次启动会慢一点**：规则集和 geo 数据需要下载一次（广告规则集约 3.3MB、geoip 约 8MB、ASN 数据约 8.6MB），之后正常。
- `ip/reject.txt` 里有 15 条 `IP-ASN` 规则，需要 `ASN.mmdb`。Clash Party 会自己下载；如果下载失败，只有广告 IP 那一条规则集受影响，不影响其它规则。
