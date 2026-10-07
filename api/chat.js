import { getJSON, setJSON, findByToken, str } from '../lib/db.js';

function bearer(req){return (req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()}
function json(res,code,data){return res.status(code).json(data)}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();

  const url=new URL(req.url,`http://${req.headers.host}`);
  const room=(url.searchParams.get('room')||'umum').replace(/[^a-z0-9_-]/gi,'');
  const key='chat_'+room;

  try{
    if(req.method==='GET'){
      const since=url.searchParams.get('since');
      const markRead=url.searchParams.get('markRead')==='1';
      const msgs=(await getJSON(key))||[];

      const found=await findByToken(bearer(req));
      if(markRead&&found){
        await setJSON('chatread_'+found.key+'_'+room, Date.now());
      }

      if(since){
        const t=Number(since);
        return res.status(200).json({ok:true,list:msgs.filter(m=>new Date(m.at).getTime()>t),serverTime:Date.now()});
      }
      return res.status(200).json(msgs.slice(-100));
    }

    if(req.method==='POST'){
      const found=await findByToken(bearer(req));
      if(!found)return json(res,401,{error:'Login dulu'});
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});

      if(body.action==='unread-count'){
        const lastSeen=(await getJSON('chatread_'+found.key+'_'+room))||0;
        const msgs=(await getJSON(key))||[];
        const unread=msgs.filter(m=>new Date(m.at).getTime()>lastSeen&&m.user!==found.user.username).length;
        return res.status(200).json({ok:true,unread});
      }

      const text=str(body.text,500);
      if(!text)return json(res,400,{error:'Pesan kosong'});
      const msgs=(await getJSON(key))||[];
      msgs.push({
        id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),
        user:found.user.username,
        classLevel:found.user.classLevel,
        text,
        at:new Date().toISOString()
      });
      await setJSON(key,msgs.slice(-200));
      return res.status(200).json({ok:true});
    }

    if(req.method==='DELETE'){
      const found=await findByToken(bearer(req));
      if(!found)return json(res,401,{error:'Login dulu'});
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const id=str(body.id,50);
      const msgs=(await getJSON(key))||[];
      const filtered=msgs.filter(m=>!(m.id===id&&m.user===found.user.username));
      await setJSON(key,filtered);
      return res.status(200).json({ok:true});
    }

    return json(res,405,{error:'Method not allowed'});
  }catch(e){
    console.error('CHAT ERROR:',e);
    return json(res,500,{error:e.message});
  }
        }
