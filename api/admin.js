const URL_=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
const TOKEN=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd){const r=await fetch(URL_,{method:"POST",headers:{Authorization:`Bearer ${TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(cmd)});const d=await r.json();if(d.error)throw new Error(d.error);return d.result}
async function all(k){const a=(await redis(["HGETALL","rb:"+k]))||[],o=[];for(let i=0;i<a.length;i+=2){try{o.push({id:a[i],d:JSON.parse(a[i+1])})}catch(e){}}return o}
module.exports=async(req,res)=>{
if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
if(!process.env.ADMIN_KEY)return res.status(500).json({error:"ADMIN_KEY belum diisi di Vercel"});
const b=req.body||{};
if(b.key!==process.env.ADMIN_KEY)return res.status(403).json({error:"Kunci admin salah"});
try{
if(b.op==="hapusSaran"){await redis(["HDEL","rb:saran",String(b.id).slice(0,80)]);return res.json({ok:true})}
const [akun,rat,sar,lb]=await Promise.all([redis(["HLEN","rb:akun"]),all("ratings"),all("saran"),all("lb")]);
const dist=[0,0,0,0,0];let sum=0;rat.forEach(x=>{const r=Math.max(1,Math.min(5,Number(x.d.r)||0));if(r){dist[r-1]++;sum+=r}});
const n=dist.reduce((a,c)=>a+c,0);
res.json({akun:Number(akun)||0,rating:{n,avg:n?sum/n:0,dist},saran:sar.sort((a,c)=>(c.d.ts||0)-(a.d.ts||0)).slice(0,100).map(x=>({id:x.id,n:x.d.n,t:x.d.t,ts:x.d.ts})),top:lb.sort((a,c)=>(c.d.p||0)-(a.d.p||0)).slice(0,10).map(x=>({n:x.d.n,p:x.d.p}))})
}catch(e){res.status(500).json({error:"Server error"})}};
