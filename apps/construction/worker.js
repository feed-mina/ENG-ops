// ENG 전용 가상 상담 화면만 배포한다. 기존 하모니 API·D1·운영 Worker와 연결하지 않는다.
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const headers={
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
   'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow',
   'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
   'Cache-Control':'no-store'
  };
  if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return Response.json({ok:false,code:'DRAFT_ONLY',message:'상담 초안 시험판은 서버 저장과 배정을 제공하지 않습니다.'},{status:503,headers});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  const response=await env.ENG_ASSETS.fetch(request);const merged=new Headers(response.headers);for(const[k,v]of Object.entries(headers))merged.set(k,v);
  return new Response(response.body,{status:response.status,headers:merged});
 }
};
