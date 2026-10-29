# Proxyrules

Clash Party（原名 Mihomo Party）覆写脚本，用于代理规则的集中管理和自定义覆写。

## 来源

本规则文件来自 [yyhhyyyyyy/selfproxy](https://github.com/yyhhyyyyyy/selfproxy)，并按 Clash Party 2.x（mihomo 内核）修正过一轮。

## 设计前提

- 只使用 `mixed-port` 混合代理（默认 7890），订阅里自带的 `port` / `socks-port` / `redir-port` / `tproxy-port` / `listeners` 会被清掉
- **不启用 TUN**（`tun.enable = false`），不写 `stack` / `strict-route` / `route-exclude-address` / `dns-hijack` 等 TUN 专用选项
- 节点按「国内 / 国外」分开，各自可以手动选择

## 目录

只有 `script.js` 一个脚本，要改的东西全在文件顶部的 `CONFIG` 里。

## CONFIG 一览（文件开头）

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `enableChinaProxy` | `true` | `true`：生成「🇨🇳 国内代理」组，国内域名/IP 走该组（组内默认 DIRECT，可在界面切到国内代理池）<br>`false`：不生成该组，国内域名/IP 直接 DIRECT |
| `mixedPort` | `7890` | 唯一的混合代理端口 |
| `allowLan` | `false` | 是否允许局域网连接 |
| `logLevel` | `"info"` | 日志等级 |
| `sniffer` | `true` | 域名嗅探。只走混合端口时可设 `false`，域名规则仍然生效，只有「应用自己解析成 IP 再连」的场景受影响 |
| `testUrl` / `testInterval` / `tolerance` | cloudflare / 300 / 50 | 测速地址、间隔、容差 |
| `loadBalanceStrategy` | `consistent-hashing` | 负载均衡策略 |
| `nameserver` / `proxyServerNameserver` | 阿里 + 腾讯 DoH | 普通域名 / 代理节点域名的解析服务器 |
| `defaultNameserver` | `223.5.5.5` / `119.29.29.29` | 必须为 IP，用于解析上面那些 DNS 服务器自己的域名 |
| `excludeTerms` | 见文件 | 公告 / 信息节点过滤词，命中就不参与分组 |
| `infoNodeRegex` | `/\d+\s*(条\|個\|个)\s*(线路\|節點\|节点)/i` | 过滤「过滤到14条线路」这类信息节点 |
| `chinaKeywords` | 见文件 | 节点名里的国内关键词（省份 / 运营商） |
| `includeTerms` | 见文件 | 节点名里的国家 / 地区关键词。英文缩写用 `wordCode()` 包一层，避免 Russia 命中 US；不使用旗帜表情 |
| `customRules` | 4399 / red.unicom | 自定义规则，目标可写策略组名、节点名或 DIRECT / REJECT |

`customRules` 里引用的目标不存在时（比如订阅换了节点名），脚本会**跳过这条规则并在日志里警告**，不会导致整份配置加载失败。

## 生成的代理组

| 组 | 类型 | 内容 |
|---|---|---|
| 🌍 国外代理 | select | 国外自动选择 / 国外手动选择 / 国外负载均衡 / DIRECT |
| 🇨🇳 国内代理 | select | 默认 DIRECT，可切「🇨🇳 国内手动选择」 |
| 🇺🇳 国外自动选择 | select | ALL - 国外自动选择 + 各地区自动选择 |
| 🇺🇳 国外手动选择 | select | 所有国外节点（无国内代理版包含全部节点） |
| 🇨🇳 国内手动选择 | select | 仅 `enableChinaProxy: true` 时生成 |
| ⚖️ 国外负载均衡 | load-balance | 所有国外节点 |
| ALL - 国外自动选择 | url-test（隐藏） | 所有国外节点 |
| HK / MO / TW / SG / JP / KR / US / UK / FR / DE / 其它 - 自动选择 | url-test（隐藏） | 按节点名关键词归类，没有对应节点就不生成 |
| ✈️ 电报信息 / 🤖 AIGC / 🍎 苹果服务 / Ⓜ️ 微软服务 | select | 默认指向「🌍 国外代理」，可切到任意地区组 |

## 使用方式

1. Clash Party → 覆写 → 导入 `script.js`
2. 确认客户端里 TUN（虚拟网卡）保持关闭，代理端口使用 `mixedPort`
3. 切换线路：
   - 全局出口：「🌍 国外代理」里选自动 / 手动 / 负载均衡
   - 具体节点：「🇺🇳 国外手动选择」「🇨🇳 国内手动选择」
   - 国内流量：默认 DIRECT（直连最快），在「🇨🇳 国内代理」组里可随时切到「🇨🇳 国内手动选择」走国内节点；选择会被 remember（`profile.store-selected`）。

## 规则顺序

广告 → 自定义 → 局域网 → 流媒体 → 电报 → 苹果 → 微软 → AIGC → 下载 → direct → domestic → cdn → global → IP（reject / telegram / stream / lan / domestic / china）→ MATCH。

CDN 规则放在具体服务之后，避免抢走 AIGC / Apple / Microsoft / Telegram 的 CDN 域名。
