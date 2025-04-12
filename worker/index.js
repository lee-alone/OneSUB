// 引入一个 YAML 解析库会更健壮
// 例如: import YAML from 'js-yaml'; // 或者其他适合 Worker 的库

// 上游订阅地址列表
const upstreamUrls = [
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/refs/heads/main/Base64/Sub2_base64.txt',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/refs/heads/main/Base64/Sub3_base64.txt',
    'https://raw.githubusercontent.com/aiboboxx/clashfree/refs/heads/main/clash.yml', // Clash 示例
    'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
    'https://raw.githubusercontent.com/free18/v2ray/refs/heads/main/v.txt',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/refs/heads/main/Base64/Sub1_base64.txt'
    // 如果有其他地址，可以继续添加
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// 定义支持的协议及其标准名称
const SUPPORTED_PROTOCOLS = new Set(['vmess', 'vless', 'ss', 'trojan', 'hysteria2']);

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean); // 获取路径片段，移除空字符串
    const requestedProtocol = pathSegments.length > 0 ? pathSegments[0].toLowerCase() : 'all'; // 默认为 'all'

    // 1. 获取所有上游订阅内容
    const allLinks = await fetchAllUpstreamContent(upstreamUrls);

    // 2. 解析和去重
    const uniqueProxiesData = processAndDeduplicate(allLinks);

    // 3. 根据请求路径过滤
    let filteredLinks;
    if (requestedProtocol === 'all') {
      filteredLinks = uniqueProxiesData.map(item => item.originalLink);
    } else if (SUPPORTED_PROTOCOLS.has(requestedProtocol)) {
      filteredLinks = uniqueProxiesData
        .filter(item => item.parsed && item.parsed.protocol === requestedProtocol)
        .map(item => item.originalLink);
    } else {
      // 如果请求的协议无效
      return new Response('协议错误', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 4. 重新编码并返回
    const combinedContent = filteredLinks.join('\n');
    const base64Encoded = btoa(combinedContent);

    return new Response(base64Encoded, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('Error handling request:', error);
    // 返回更通用的错误信息给客户端
    return new Response('Internal Server Error processing subscription', { status: 500 });
  }
}

// --- 辅助函数 ---

async function fetchAllUpstreamContent(urls) {
  const promises = urls.map(url =>
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        return response.text();
      })
      .catch(error => {
        console.warn(`Warning: Could not fetch ${url}. Skipping. Error: ${error.message}`);
        return null; // 返回 null 表示失败
      })
  );

  const contents = await Promise.all(promises);
  let allLinks = [];

  for (const content of contents) {
    if (content) {
      let linksFromSource = [];
      try {
        // 尝试 Base64 解码
        const decoded = atob(content.trim());
        // 按行分割链接
        linksFromSource = decoded.split(/[\r\n]+/).map(link => link.trim()).filter(link => link);
      } catch (e) {
        // 如果解码失败，尝试解析为 Clash 配置
        console.warn(`Content from one source could not be decoded as Base64. Attempting to parse as Clash config... Content starts with: ${content.substring(0, 100)}...`);
        try {
          // **注意：** parseClashContent 使用简化的解析逻辑，可能不适用于所有 Clash 配置。
          // 推荐使用 YAML 库: const clashConfig = YAML.parse(content);
          // linksFromSource = parseClashProxies(clashConfig);
          linksFromSource = parseClashContent(content); // 使用简化版解析
        } catch (yamlError) {
          console.warn(`Failed to parse content as Clash config: ${yamlError.message}. Skipping this source.`);
          linksFromSource = []; // 解析失败则忽略
        }
      }
      allLinks = allLinks.concat(linksFromSource);
    }
  }

  return allLinks;
}

// --- Clash 解析相关函数 ---

/**
 * 尝试解析 Clash 配置内容 (YAML)，提取代理链接。
 * **注意：** 这是一个非常简化的、基于字符串处理的解析器，仅适用于特定格式。
 * 强烈建议使用成熟的 YAML 库代替。
 * @param {string} yamlContent Clash 配置的文本内容
 * @returns {string[]} 提取出的代理分享链接数组
 */
function parseClashContent(yamlContent) {
    const lines = yamlContent.split('\n');
    const proxies = [];
    let inProxiesSection = false;
    let currentProxy = null;

    // Helper to parse key-value pair, handling quotes and basic types
    const parseKeyValue = (linePart) => {
        const firstColonIndex = linePart.indexOf(':');
        if (firstColonIndex <= 0) return null; // Invalid format

        const key = linePart.substring(0, firstColonIndex).trim();
        let value = linePart.substring(firstColonIndex + 1).trim();

        // Remove surrounding quotes (single or double)
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            value = value.substring(1, value.length - 1);
        } else if (value === 'true') { // Basic type conversion
            value = true;
        } else if (value === 'false') {
            value = false;
        } else if (!isNaN(value) && value.trim() !== '') {
            value = Number(value);
        }
        return { key, value };
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        const indentation = line.length - line.trimStart().length; // Calculate indentation

        if (trimmedLine.startsWith('proxies:')) {
            inProxiesSection = true;
            continue;
        }

        // Detect end of proxies section (less indentation or empty line after proxies started)
        if (inProxiesSection && currentProxy && indentation < 2 && trimmedLine !== '') {
             // Process the last proxy before exiting the section
            const link = convertClashProxyToLink(currentProxy);
            if (link) proxies.push(link);
            currentProxy = null;
            inProxiesSection = false; // Exit proxies section
            // You might want to 'break' here if you only care about the proxies section
        }

        if (inProxiesSection) {
            if (indentation === 2 && trimmedLine.startsWith('-')) { // Start of a new proxy item
                // Process the previous proxy item first
                if (currentProxy) {
                    const link = convertClashProxyToLink(currentProxy);
                    if (link) proxies.push(link);
                }
                currentProxy = {}; // Initialize new proxy object

                const itemContent = trimmedLine.substring(1).trim(); // Content after '-'

                if (itemContent.startsWith('{') && itemContent.endsWith('}')) {
                    // Handle inline map: - { key: value, key2: value2 }
                    const inlineContent = itemContent.substring(1, itemContent.length - 1).trim();
                    // Basic split by comma, might fail with nested structures or commas in values
                    const pairs = inlineContent.split(',').map(p => p.trim()).filter(p => p);
                    for (const pair of pairs) {
                        const kv = parseKeyValue(pair);
                        if (kv) {
                            // Basic handling for nested ws-opts/headers inline (won't work reliably)
                            if (kv.key === 'ws-opts' || kv.key === 'http-opts' || kv.key === 'reality-opts') {
                                console.warn("Inline nested options like ws-opts are not fully supported by this basic parser.");
                                // Attempt basic parsing if value looks like a simple object string
                                if (typeof kv.value === 'string' && kv.value.startsWith('{') && kv.value.endsWith('}')) {
                                    try {
                                        // This is risky and likely to fail often
                                        const nestedPairs = kv.value.substring(1, kv.value.length - 1).split(',').map(p => p.trim());
                                        const nestedObj = {};
                                        for(const np of nestedPairs) {
                                            const nkv = parseKeyValue(np);
                                            if(nkv) nestedObj[nkv.key] = nkv.value;
                                        }
                                        currentProxy[kv.key] = nestedObj;
                                    } catch {
                                        currentProxy[kv.key] = kv.value; // Fallback to string
                                    }
                                } else {
                                     currentProxy[kv.key] = kv.value;
                                }
                            } else {
                                currentProxy[kv.key] = kv.value;
                            }
                        }
                    }
                } else {
                    // Handle block map start: - name: Proxy Name
                    const kv = parseKeyValue(itemContent);
                    if (kv) {
                        currentProxy[kv.key] = kv.value;
                    }
                }
            } else if (currentProxy && indentation >= 4) { // Properties of the current proxy (block map)
                const kv = parseKeyValue(trimmedLine);
                if (kv) {
                    // Basic handling for nested structures like ws-opts
                    // This needs improvement for real YAML parsing
                    if (kv.key === 'ws-opts' || kv.key === 'http-opts' || kv.key === 'grpc-opts' || kv.key === 'reality-opts') {
                        currentProxy[kv.key] = currentProxy[kv.key] || {}; // Ensure object exists
                    } else if (kv.key === 'path' && (currentProxy['ws-opts'] || currentProxy['http-opts'])) {
                        (currentProxy['ws-opts'] || currentProxy['http-opts'])['path'] = kv.value;
                    } else if (kv.key === 'headers' && (currentProxy['ws-opts'] || currentProxy['http-opts'])) {
                        (currentProxy['ws-opts'] || currentProxy['http-opts'])['headers'] = (currentProxy['ws-opts'] || currentProxy['http-opts'])['headers'] || {};
                    } else if (kv.key === 'Host' && currentProxy['ws-opts']?.headers) {
                         currentProxy['ws-opts']['headers']['Host'] = kv.value;
                    } else if (kv.key === 'Host' && currentProxy['http-opts']?.headers) {
                         // HTTP opts headers are often an array [key, value]
                         currentProxy['http-opts']['headers']['Host'] = [kv.value]; // Assuming single Host header
                    } else if (kv.key === 'public-key' && currentProxy['reality-opts']) {
                         currentProxy['reality-opts']['public-key'] = kv.value;
                    } else if (kv.key === 'short-id' && currentProxy['reality-opts']) {
                         currentProxy['reality-opts']['short-id'] = kv.value;
                    }
                     else {
                        currentProxy[kv.key] = kv.value;
                    }
                }
            }
        }
    }

    // Process the very last proxy item in the file
    if (currentProxy) {
        const link = convertClashProxyToLink(currentProxy);
        if (link) proxies.push(link);
    }

    console.log(`Parsed ${proxies.length} proxies from Clash content.`);
    return proxies;
}


/**
 * 将从 Clash 配置解析出的单个代理对象转换为标准分享链接。
 * @param {object} proxy Clash 代理对象
 * @returns {string|null} 标准分享链接或 null
 */
function convertClashProxyToLink(proxy) {
    try {
        const name = proxy.name || 'Unnamed';
        const server = proxy.server;
        const port = proxy.port;

        if (!server || !port || !proxy.type) {
            console.warn(`Skipping Clash proxy due to missing server, port, or type: ${JSON.stringify(proxy)}`);
            return null;
        }

        switch (proxy.type) {
            case 'vmess':
                const vmessConfig = {
                    v: "2", // Vmess 版本，通常是 "2"
                    ps: name,
                    add: server,
                    port: port,
                    id: proxy.uuid,
                    aid: proxy.alterId || 0,
                    scy: proxy.cipher || 'auto',
                    net: proxy.network || 'tcp',
                    type: proxy['header-type'] || 'none', // 'none' for tcp, 'http' for http
                    host: proxy['ws-opts']?.headers?.Host || proxy['http-opts']?.headers?.Host?.[0] || '', // HTTP Host header
                    path: proxy['ws-opts']?.path || proxy['http-opts']?.path?.[0] || '/', // Path for ws/http
                    tls: proxy.tls ? 'tls' : '', // TLS setting
                    sni: proxy.servername || '', // SNI
                };
                // 清理空值，减少 base64 体积
                Object.keys(vmessConfig).forEach(key => {
                    if (vmessConfig[key] === '' || vmessConfig[key] === null || vmessConfig[key] === undefined || vmessConfig[key] === 0 && key === 'aid' || vmessConfig[key] === 'none' && key === 'type' || vmessConfig[key] === '/' && key === 'path') {
                         if(!(key === 'port' || key === 'aid')) { // port 和 aid 为 0 有意义
                            delete vmessConfig[key];
                         }
                    }
                });
                // Encode JSON string to handle potential Unicode characters in 'ps' (name) for btoa
                const jsonString = JSON.stringify(vmessConfig);
                const encodedString = unescape(encodeURIComponent(jsonString));
                return 'vmess://' + btoa(encodedString);

            case 'ss':
                if (!proxy.cipher || !proxy.password) return null;
                // SS 链接格式: ss://method:password@server:port#name
                // 需要 Base64 编码 method:password 部分
                const userInfo = `${proxy.cipher}:${proxy.password}`;
                const base64UserInfo = btoa(userInfo).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); // URL safe base64
                return `ss://${base64UserInfo}@${server}:${port}#${encodeURIComponent(name)}`;

            case 'trojan':
                if (!proxy.password) return null;
                // Trojan 链接格式: trojan://password@server:port?params#name
                const trojanUrl = new URL(`trojan://${server}:${port}`);
                trojanUrl.username = proxy.password;
                trojanUrl.hash = `#${encodeURIComponent(name)}`;
                if (proxy.sni) trojanUrl.searchParams.set('sni', proxy.sni);
                if (proxy.network === 'ws') {
                    trojanUrl.searchParams.set('type', 'ws');
                    if (proxy['ws-opts']?.path) trojanUrl.searchParams.set('path', proxy['ws-opts'].path);
                    if (proxy['ws-opts']?.headers?.Host) trojanUrl.searchParams.set('host', proxy['ws-opts'].headers.Host);
                }
                // 其他 Trojan 参数 (如 flow, security 等) 可以按需添加
                if (proxy.allowInsecure || proxy['skip-cert-verify']) {
                    trojanUrl.searchParams.set('security', 'none'); // 不规范，但有些客户端可能认
                } else {
                     trojanUrl.searchParams.set('security', 'tls'); // 默认 tls
                }
                return trojanUrl.toString();

            case 'vless':
                 if (!proxy.uuid) return null;
                 // VLESS 链接格式: vless://uuid@server:port?params#name
                 const vlessUrl = new URL(`vless://${server}:${port}`);
                 vlessUrl.username = proxy.uuid;
                 vlessUrl.hash = `#${encodeURIComponent(name)}`;
                 vlessUrl.searchParams.set('type', proxy.network || 'tcp');
                 if (proxy.tls) {
                     vlessUrl.searchParams.set('security', 'tls');
                     if (proxy.servername) vlessUrl.searchParams.set('sni', proxy.servername);
                     if (proxy['client-fingerprint']) vlessUrl.searchParams.set('fp', proxy['client-fingerprint']);
                 }
                 if (proxy.network === 'ws') {
                     if (proxy['ws-opts']?.path) vlessUrl.searchParams.set('path', proxy['ws-opts'].path);
                     if (proxy['ws-opts']?.headers?.Host) vlessUrl.searchParams.set('host', proxy['ws-opts'].headers.Host);
                 }
                 // Reality 参数
                 if (proxy['reality-opts']?.['public-key']) {
                     vlessUrl.searchParams.set('security', 'reality');
                     vlessUrl.searchParams.set('pbk', proxy['reality-opts']['public-key']);
                     if (proxy['reality-opts']?.['short-id']) vlessUrl.searchParams.set('sid', proxy['reality-opts']['short-id']);
                     // Reality 通常需要 SNI 和 Fingerprint
                     if (proxy.servername) vlessUrl.searchParams.set('sni', proxy.servername);
                     if (proxy['client-fingerprint']) vlessUrl.searchParams.set('fp', proxy['client-fingerprint']);
                 }
                 // 其他 VLESS 参数 (flow, grpc opts 等)
                 if (proxy.flow) vlessUrl.searchParams.set('flow', proxy.flow);

                 return vlessUrl.toString();

            // 可以添加对 SOCKS5, HTTP 等其他 Clash 类型的支持（如果需要转换为某种链接格式）
            // case 'socks5':
            // case 'http':

            default:
                console.warn(`Unsupported Clash proxy type: ${proxy.type}`);
                return null;
        }
    } catch (error) {
        console.error(`Error converting Clash proxy to link: ${JSON.stringify(proxy)}`, error);
        return null;
    }
}


// --- 解析和去重辅助函数 (保持不变) ---

function processAndDeduplicate(links) {
  // 使用 Map 存储，key 为唯一标识符，value 为 { originalLink, parsed }
  const uniqueProxies = new Map();

  for (const link of links) {
    let parsed = null;
    let key = null;
    try {
      parsed = parseProxyLink(link); // 使用现有的解析函数
      if (parsed) {
        key = generateProxyKey(parsed); // 使用现有的 key 生成函数
        if (key && !uniqueProxies.has(key)) {
          uniqueProxies.set(key, { originalLink: link, parsed: parsed });
        } else if (key) {
            // console.log(`Duplicate proxy found and skipped: ${key}`);
        }
      } else {
         // 无法解析的链接，可以选择忽略或用原始链接作为 key 存储
         // 这里选择忽略，只收集成功解析的
         // console.warn(`Could not parse link (unsupported or malformed): ${link.substring(0, 50)}...`);
      }
    } catch (e) {
      console.error(`Error processing link ${link.substring(0,50)}...: ${e.message}`);
      // 发生错误时也忽略此链接
    }
  }

  // 返回包含解析后信息的对象数组
  return Array.from(uniqueProxies.values());
}

// --- 各协议解析函数 (保持不变) ---
// parseProxyLink, generateProxyKey, parseVmessLink, parseVlessLink, parseSsLink, parseTrojanLink, parseHy2Link
// ... (省略之前已有的解析函数代码，它们保持不变) ...

// --- 各协议解析函数 (需要保留，因为 processAndDeduplicate 依赖它们) ---

// 解析单个代理链接
function parseProxyLink(link) {
  if (link.startsWith('vmess://')) {
    return parseVmessLink(link);
  } else if (link.startsWith('vless://')) {
    return parseVlessLink(link);
  } else if (link.startsWith('ss://')) {
    return parseSsLink(link);
  } else if (link.startsWith('trojan://')) {
    return parseTrojanLink(link);
  } else if (link.startsWith('hy2://') || link.startsWith('hysteria2://')) { // 支持两种前缀
    return parseHy2Link(link);
  }
  // 可以添加对其他协议的支持
  return null; // 不支持或无法识别的协议
}

// 为解析后的代理生成唯一键
function generateProxyKey(parsed) {
  if (!parsed || !parsed.protocol || !parsed.address || !parsed.port) {
    return null; // 缺少关键信息，无法生成有效 key
  }
  // 根据协议类型包含不同的关键字段
  switch (parsed.protocol) {
    case 'vmess':
    case 'vless':
      // 对于 Vmess/Vless，地址、端口、用户ID 是关键
      return `${parsed.protocol}:${parsed.address}:${parsed.port}:${parsed.id}`;
    case 'ss':
      // 对于 SS，地址、端口、加密方法、密码 是关键
      return `${parsed.protocol}:${parsed.address}:${parsed.port}:${parsed.method}:${parsed.password}`;
    case 'trojan':
      // 对于 Trojan，地址、端口、密码 是关键
      return `${parsed.protocol}:${parsed.address}:${parsed.port}:${parsed.password}`;
    case 'hysteria2': // Hysteria2 (hy2)
      // 对于 Hy2，地址、端口、认证密码 是关键
      return `${parsed.protocol}:${parsed.address}:${parsed.port}:${parsed.auth}`;
    default:
      // 对于其他或未知协议，使用地址和端口作为基础 key
      return `${parsed.protocol}:${parsed.address}:${parsed.port}`; // 可能需要更精细的处理
  }
}

// --- 各协议解析函数 ---

function parseVmessLink(link) {
    try {
        const base64Part = link.substring('vmess://'.length);
        const decodedJson = atob(base64Part);
        const config = JSON.parse(decodedJson);

        // 提取关键信息，注意字段名可能变化，做兼容处理
        const address = config.add || config.address || '';
        const port = config.port || 0;
        const id = config.id || config.uuid || '';
        const network = config.net || config.network || 'tcp';
        const type = config.type || 'none'; // header type for http/ws
        const path = config.path || '/';
        const host = config.host || '';
        const tls = config.tls || ''; // "tls" or ""
        const sni = config.sni || '';

        if (!address || !port || !id) return null; // 缺少核心信息

        return {
            protocol: 'vmess',
            address,
            port: parseInt(port, 10),
            id,
            network,
            type, // none, http, ws, etc.
            path,
            host,
            tls: tls === 'tls',
            sni: sni,
            ps: config.ps || config.remark || `vmess-${address}:${port}` // 节点名
        };
    } catch (e) {
        // console.error(`Error parsing VMess link: ${link}`, e);
        return null;
    }
}


function parseVlessLink(link) {
    try {
        const url = new URL(link);
        const address = url.hostname;
        const port = parseInt(url.port, 10);
        const id = url.username; // VLESS 的 ID 在 username 部分
        const params = url.searchParams;

        if (!address || !port || !id) return null;

        return {
            protocol: 'vless',
            address,
            port,
            id,
            network: params.get('type') || 'tcp', // ws, grpc etc.
            security: params.get('security') || 'none', // tls, reality
            sni: params.get('sni') || params.get('host') || address, // SNI
            path: params.get('path') || (params.get('type') === 'grpc' ? params.get('serviceName') : '/'), // Path for ws, serviceName for grpc
            host: params.get('host') || address, // Host header for ws
            fp: params.get('fp') || '', // fingerprint for reality
            pbk: params.get('pbk') || '', // public key for reality
            sid: params.get('sid') || '', // short id for reality
            flow: params.get('flow') || '', // flow control
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `vless-${address}:${port}`
        };
    } catch (e) {
        // console.error(`Error parsing VLESS link: ${link}`, e);
        return null;
    }
}

function parseSsLink(link) {
    try {
        // 移除 'ss://' 前缀
        const ssContent = link.substring('ss://'.length);

        // 分离备注信息
        const hashIndex = ssContent.lastIndexOf('#');
        const mainPart = hashIndex === -1 ? ssContent : ssContent.substring(0, hashIndex);
        const remark = hashIndex === -1 ? '' : decodeURIComponent(ssContent.substring(hashIndex + 1));

        // 尝试解码 Base64 部分
        let decodedUserInfo, serverPart;
        if (mainPart.includes('@')) {
            // 格式1: base64(method:password)@server:port or method:password@server:port
             const atIndex = mainPart.indexOf('@');
             const userInfoPart = mainPart.substring(0, atIndex);
             serverPart = mainPart.substring(atIndex + 1);
             try {
                 // 尝试 Base64 解码
                 decodedUserInfo = atob(userInfoPart.replace(/-/g, '+').replace(/_/g, '/'));
             } catch(e) {
                 // 如果解码失败，假设是明文 method:password
                 decodedUserInfo = userInfoPart;
             }
        } else {
             // 格式2: base64(method:password@server:port)
             const decoded = atob(mainPart.replace(/-/g, '+').replace(/_/g, '/'));
             const atIndex = decoded.indexOf('@');
             if (atIndex === -1) return null; // 无效格式
             decodedUserInfo = decoded.substring(0, atIndex);
             serverPart = decoded.substring(atIndex + 1);
        }

        const [server, portStr] = serverPart.split(':');
        const port = parseInt(portStr, 10);

        const colonIndex = decodedUserInfo.indexOf(':');
        if (colonIndex === -1) return null; // 无效格式
        const method = decodedUserInfo.substring(0, colonIndex);
        const password = decodedUserInfo.substring(colonIndex + 1);


        if (!server || !port || !method || !password) return null;

        return {
            protocol: 'ss',
            address: server,
            port: port,
            method: method,
            password: password,
            plugin: '', // 插件信息暂不处理
            ps: remark || `ss-${server}:${port}`
        };
    } catch (e) {
        // console.error(`Error parsing SS link: ${link}`, e);
        return null;
    }
}

function parseTrojanLink(link) {
    try {
        const url = new URL(link);
        const address = url.hostname;
        const port = parseInt(url.port, 10);
        const password = url.username || url.password; // 兼容 username 和 password
        const params = url.searchParams;

        if (!address || !port || !password) return null;

        return {
            protocol: 'trojan',
            address,
            port,
            password,
            sni: params.get('sni') || params.get('peer') || address, // SNI
            network: params.get('type') || 'tcp', // ws, grpc
            path: params.get('path') || '/', // for ws
            host: params.get('host') || address, // for ws header
            security: params.get('security') || 'tls', // 通常是 tls
            allowInsecure: params.get('allowInsecure') === '1' || params.get('skip-cert-verify') === '1',
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `trojan-${address}:${port}`
        };
    } catch (e) {
        // console.error(`Error parsing Trojan link: ${link}`, e);
        return null;
    }
}

function parseHy2Link(link) {
    try {
        // Hysteria2 链接可能以 hy2:// 或 hysteria2:// 开头
        const urlString = link.startsWith('hysteria2://') ? link : 'hysteria2://' + link.substring('hy2://'.length);
        const url = new URL(urlString);
        const address = url.hostname;
        const port = parseInt(url.port, 10);
        const auth = url.username || url.password; // 认证信息可能在 username 或 password
        const params = url.searchParams;

        if (!address || !port || !auth) return null; // 地址、端口、认证是必须的

        return {
            protocol: 'hysteria2', // 使用 'hysteria2' 作为标准协议名
            address,
            port,
            auth, // 认证密码
            sni: params.get('sni') || address,
            insecure: params.get('insecure') === '1' || params.get('allowInsecure') === '1' || params.get('skip-cert-verify') === '1', // 兼容多种写法
            obfs: params.get('obfs') || '',
            obfsPassword: params.get('obfs-password') || params.get('obfs-pw') || '', // 兼容两种写法
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `hy2-${address}:${port}`
        };
    } catch (e) {
        // console.error(`Error parsing Hysteria2 link: ${link}`, e);
        return null;
    }
}

// Base64 functions (atob, btoa) are globally available in Cloudflare Workers.