// 上游订阅地址列表
const upstreamUrls = [
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/refs/heads/main/Base64/Sub2_base64.txt',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/refs/heads/main/Base64/Sub3_base64.txt',
    'https://raw.githubusercontent.com/aiboboxx/clashfree/refs/heads/main/clash.yml',
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
    // processAndDeduplicate 现在返回 [{ originalLink, parsed }, ...]
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
        return ''; // 返回空字符串，允许部分成功
      })
  );

  const contents = await Promise.all(promises);
  let allLinks = [];

  contents.forEach(content => {
    if (content) {
      try {
        // 尝试 Base64 解码
        const decoded = atob(content.trim());
        // 按行分割链接
        const links = decoded.split(/[\r\n]+/).map(link => link.trim()).filter(link => link);
        allLinks = allLinks.concat(links);
      } catch (e) {
        // 如果解码失败，假设它不是 Base64 编码的链接列表（可能是 Clash 配置或其他）
        // 暂时忽略非 Base64 内容，或者在这里添加 Clash 解析逻辑
        console.warn(`Warning: Content from one source could not be decoded as Base64 or is not a simple list. Content starts with: ${content.substring(0, 50)}...`);
        // 如果确定有 Clash 订阅，需要在这里添加解析逻辑
        // const clashLinks = parseClashConfig(content);
        // allLinks = allLinks.concat(clashLinks);
      }
    }
  });

  return allLinks;
}

function processAndDeduplicate(links) {
  // 使用 Map 存储，key 为唯一标识符，value 为 { originalLink, parsed }
  const uniqueProxies = new Map();

  for (const link of links) {
    let parsed = null;
    let key = null;
    try {
      parsed = parseProxyLink(link);
      if (parsed) {
        key = generateProxyKey(parsed);
        if (key && !uniqueProxies.has(key)) {
          uniqueProxies.set(key, { originalLink: link, parsed: parsed });
        }
      } else {
         // 无法解析的链接，可以选择忽略或用原始链接作为 key 存储
         // 这里选择忽略，只收集成功解析的
         console.warn(`Could not parse link (unsupported or malformed): ${link}`);
      }
    } catch (e) {
      console.error(`Error processing link ${link}: ${e.message}`);
      // 发生错误时也忽略此链接
    }
  }

  // 返回包含解析后信息的对象数组
  return Array.from(uniqueProxies.values());
}

// --- 解析和去重辅助函数 ---

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
            ps: config.ps || config.remark || `vmess-${address}:${port}` // 节点名
        };
    } catch (e) {
        console.error(`Error parsing VMess link: ${link}`, e);
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
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `vless-${address}:${port}`
        };
    } catch (e) {
        console.error(`Error parsing VLESS link: ${link}`, e);
        return null;
    }
}

function parseSsLink(link) {
    try {
        // 移除 'ss://' 前缀
        const ssContent = link.substring('ss://'.length);
        
        // 分离备注信息
        const [mainPart, remark = ''] = ssContent.split('#');
        
        // 检查是否包含 '@' 来确定格式类型
        if (mainPart.includes('@')) {
            // 格式1: base64(method:password)@server:port
            const [encoded, serverPart] = mainPart.split('@');
            const [server, port] = serverPart.split(':');
            
            // 确保编码的部分是合法的 Base64
            const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
            const [method, password] = decoded.split(':');
            
            if (!server || !port || !method || !password) return null;
            
            return {
                protocol: 'ss',
                address: server,
                port: parseInt(port, 10),
                method: method,
                password: password,
                plugin: '',
                ps: decodeURIComponent(remark) || `ss-${server}:${port}`
            };
        } else {
            // 格式2: base64(method:password@server:port)
            const decoded = atob(mainPart.replace(/-/g, '+').replace(/_/g, '/'));
            const [userInfo, serverPart] = decoded.split('@');
            const [method, password] = userInfo.split(':');
            const [server, port] = serverPart.split(':');
            
            if (!server || !port || !method || !password) return null;
            
            return {
                protocol: 'ss',
                address: server,
                port: parseInt(port, 10),
                method: method,
                password: password,
                plugin: '',
                ps: decodeURIComponent(remark) || `ss-${server}:${port}`
            };
        }
    } catch (e) {
        console.error(`Error parsing SS link: ${link}`, e);
        return null;
    }
}

function parseTrojanLink(link) {
    try {
        const url = new URL(link);
        const address = url.hostname;
        const port = parseInt(url.port, 10);
        const password = url.username; // Trojan 密码在 username 部分
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
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `trojan-${address}:${port}`
        };
    } catch (e) {
        console.error(`Error parsing Trojan link: ${link}`, e);
        return null;
    }
}

function parseHy2Link(link) {
    try {
        const url = new URL(link);
        const address = url.hostname;
        const port = parseInt(url.port, 10);
        const auth = url.username || ''; // Hysteria2 认证信息在 username 部分
        const params = url.searchParams;

        if (!address || !port || !auth) return null; // 地址、端口、认证是必须的

        return {
            protocol: 'hysteria2', // 使用 'hysteria2' 作为标准协议名
            address,
            port,
            auth, // 认证密码
            sni: params.get('sni') || address,
            insecure: params.get('insecure') === '1' || params.get('allowInsecure') === '1', // 兼容两种写法
            obfs: params.get('obfs') || '',
            obfsPassword: params.get('obfs-password') || params.get('obfs-pw') || '', // 兼容两种写法
            ps: url.hash ? decodeURIComponent(url.hash.substring(1)) : `hy2-${address}:${port}`
        };
    } catch (e) {
        console.error(`Error parsing Hysteria2 link: ${link}`, e);
        return null;
    }
}

// Base64 functions (atob, btoa) are globally available in Cloudflare Workers.