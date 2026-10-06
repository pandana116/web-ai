import { getJSON, setJSON, findByToken, num, str } from './db.js';

function bearer(req){return (req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()}
function json(res,code,data){return res.status(code).json(data)}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});

  try{
    const found=await findByToken(bearer(req));
    if(!found)return json(res,401,{error:'Login dulu'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const mapel=str(body.mapel,40)||'Matematika';
    const kelas=num(body.kelas)||found.user.classLevel||6;
    const jumlah=Math.min(Math.max(num(body.jumlah)||5,1),10);
    const kesulitan=str(body.kesulitan,20)||'sedang';

    if(kelas<1||kelas>12)return json(res,400,{error:'Kelas 1–12'});

    const cacheKey='gen_'+mapel.toLowerCase().replace(/\s/g,'')+'_k'+kelas+'_'+kesulitan;
    let cache=(await getJSON(cacheKey))||[];
    if(cache.length<50){
      const key=process.env.GROQ_API_KEY;
      if(!key)return json(res,500,{error:'GROQ_API_KEY belum di-set di Vercel'});

      const prompt=`Buat ${jumlah} soal pilihan ganda ${mapel} untuk siswa kelas ${kelas} ${kelas<=6?'SD':kelas<=9?'SMP':'SMA'} tingkat ${kesulitan}.

Aturan:
- Setiap soal punya tepat 4 pilihan (A, B, C, D)
- Hanya 1 jawaban benar
- Sertakan pembahasan singkat
- Bahasa Indonesia sederhana
- Sesuai kurikulum Indonesia

Jawab dalam JSON dengan format:
{"soal":[{"q":"pertanyaan","o":["opsi A","opsi B","opsi C","opsi D"],"a":0,"e":"pembahasan"}]}

Nilai "a" adalah index jawaban benar (0-3). Langsung balas JSON saja, tanpa teks lain.`;

      const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({
          model:'llama-3.3-70b-versatile',
          messages:[
            {role:'system',content:'Kamu pembuat soal ujian untuk siswa Indonesia. Selalu balas JSON valid tanpa teks tambahan.'},
            {role:'user',content:prompt}
          ],
          response_format:{type:'json_object'},
          temperature:0.8,
          max_tokens:2000
        })
      });

      if(!r.ok){
        const err=await r.text();
        console.error('GROQ ERR:',err);
        if(cache.length===0)return json(res,500,{error:'Groq error: '+r.status});
      }else{
        const d=await r.json();
        const content=d.choices?.[0]?.message?.content||'{}';
        let parsed={};
        try{parsed=JSON.parse(content)}catch(e){console.warn('parse gagal',content.slice(0,200))}

        const list=(parsed.soal||[]).filter(function(q){
          return q&&q.q&&Array.isArray(q.o)&&q.o.length===4&&typeof q.a==='number'&&q.a>=0&&q.a<=3;
        }).map(function(q){
          return{
            s:mapel,k:'AI-'+kelas,
            q:str(q.q,300),
            o:q.o.map(function(x){return str(x,100)}),
            a:q.a,
            e:str(q.e||'Tidak ada pembahasan.',300),
            lv:kelas<=6?'SD':kelas<=9?'SMP':'SMA',
            t:'ai',
            gen:Date.now()
          };
        });

        cache=cache.concat(list);
        await setJSON(cacheKey,cache.slice(-200));
      }
    }

    const acak=cache.sort(function(){return Math.random()-0.5}).slice(0,jumlah);
    return json(res,200,{ok:true,soal:acak,total:cache.length});
  }catch(e){
    console.error('GENERATE ERROR:',e);
    return json(res,500,{error:e.message});
  }
          }
