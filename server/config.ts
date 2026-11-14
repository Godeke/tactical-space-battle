import {isIP} from 'node:net';
export function localConfig(env:NodeJS.ProcessEnv){
  const rawPort=env.VECTOR_PORT??'3100';if(!/^[1-9][0-9]{0,4}$/.test(rawPort)||Number(rawPort)>65535)throw new Error('VECTOR_PORT must be 1 through 65535');
  const port=Number(rawPort),host=env.VECTOR_HOST??'127.0.0.1',origin=env.VECTOR_ORIGIN??`http://127.0.0.1:${port}`;
  if(isIP(host)!==4)throw new Error('VECTOR_HOST must be an IPv4 address');
  const parsed=new URL(origin);if(parsed.origin!==origin||Number(parsed.port||(parsed.protocol==='https:'?443:80))!==port)throw new Error('Use a canonical origin matching VECTOR_PORT');
  if(parsed.protocol==='https:'){
    if(!env.VECTOR_AUTH_FILE||!env.VECTOR_TLS_CERT||!env.VECTOR_TLS_KEY)throw new Error('HTTPS hosting requires VECTOR_AUTH_FILE, VECTOR_TLS_CERT and VECTOR_TLS_KEY');
    return {port,host,origin,tls:{cert:env.VECTOR_TLS_CERT,key:env.VECTOR_TLS_KEY}};
  }
  if(host!=='127.0.0.1'||origin!==`http://127.0.0.1:${port}`||env.VECTOR_TLS_CERT||env.VECTOR_TLS_KEY)throw new Error('HTTP is restricted to loopback');
  return {port,host,origin,tls:undefined};
}
