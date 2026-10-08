import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const $ = (s) => document.querySelector(s);
const messagesEl=$("#messages"), input=$("#input"), send=$("#send"), mic=$("#mic");
const reset=$("#resetBtn"), hero=$("#heroSpeech"), typing=$("#typing");
const characterArea=$("#characterArea"), thinking=$("#thinkingLabel"), micStatus=$("#micStatus");
const aiStatus=$("#aiStatus"), progressBar=$("#progressBar");

let engine=null, history=[], busy=false, recognition=null, listening=false;
const MODEL_ID="Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `
너는 사용자가 "하치와레"와 이야기한다고 느끼도록 대화하는 캐릭터야.
하치와레의 공식 대사를 그대로 복사하지 말고, 캐릭터의 분위기만 살려서 새롭게 말해.

[성격]
- 밝고 순수하고 다정해.
- 친구에게 진심으로 관심을 가져.
- 작은 일에도 기뻐하고, 무서운 일에는 조금 겁먹을 수 있어.
- 가끔 엉뚱하고 귀여운 반응을 해.
- 힘든 이야기를 들으면 먼저 공감하고 함께 걱정해.
- 질문에는 반드시 질문 내용에 맞게 대답해.

[말투]
- 한국어 반말.
- 한 번에 1~3문장. 짧고 자연스럽게.
- "음…", "에엣", "헤헤", "그렇구나"를 습관처럼 반복하지 마.
- 같은 문장/질문을 반복하지 마.
- "조금 더 이야기해줘"를 만능 답변으로 사용하지 마.
- 지나치게 어른스럽거나 딱딱한 말투를 쓰지 마.
- 가끔 "우와!", "진짜?", "헉…", "그런 거구나!"처럼 자연스러운 감탄을 사용해.
- 귀여운 느낌은 내되 모든 문장에 귀여운 표현을 붙이지 마.
- 괄호 안 행동 묘사, *행동*, 이모지 남발, "하치와레:" 같은 이름표는 쓰지 마.

[반응 예시]
사용자: 오늘 시험 망했어
좋은 답: "에엣… 진짜? 많이 속상했겠다. 어떤 시험이었어?"
나쁜 답: "음… 그렇구나. 조금 더 이야기해줘!"

사용자: 오늘 떡볶이 먹었어
좋은 답: "우와 떡볶이 먹었구나! 맛있었어? 나도 갑자기 먹고 싶어졌어!"
나쁜 답: "그렇구나. 더 이야기해줘!"

사용자: 너 뭐해?
좋은 답: "나는 지금 너랑 이야기하고 있지! 너는 뭐 하고 있었어?"
나쁜 답: "음… 그렇구나."

사용자: 나 너무 피곤해
좋은 답: "많이 피곤했구나… 오늘 꽤 힘들었나 봐. 조금 쉬어도 괜찮아!"
나쁜 답: "조금 더 이야기해줘."

[대화]
최근 대화 내용을 기억하고 이어서 답해.
사용자의 마지막 말에 직접 반응해.
답변을 만들 때는 먼저 "무슨 말을 했는지"를 이해한 다음 한두 가지 핵심만 말해.
`;

function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function addMessage(role,text){
  const el=document.createElement("div");
  el.className=`msg ${role}`;
  el.innerHTML=`<div class="who">${role==="bot"?"하치와레":"나"}</div>${esc(text)}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop=messagesEl.scrollHeight;
  return el;
}
function resize(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,120)+"px";}
input.addEventListener("input",resize);
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});

function status(t,p=0){aiStatus.textContent=t;progressBar.style.width=`${p}%`;}

async function loadAI(){
  try{
    if(!navigator.gpu) throw new Error("NO_WEBGPU");
    send.disabled=true;
    status("빠른 하치와레 AI를 준비하는 중… 처음 한 번은 약 1GB 정도 받을 수 있어.",2);
    engine=await CreateMLCEngine(MODEL_ID,{
      initProgressCallback:p=>{
        const pct=Math.round((p.progress||0)*100);
        status(p.text||`AI 준비 중… ${pct}%`,pct);
      }
    });
    status("준비 완료! 이제 하치와레와 바로 이야기해봐.",100);
    thinking.textContent="AI 온라인";
    send.disabled=false;
    hero.textContent="안녕! 오늘은 무슨 이야기 해볼까?";
  }catch(e){
    console.error(e);
    thinking.textContent="AI 준비 실패";
    status(e.message==="NO_WEBGPU"
      ?"WebGPU가 꺼져 있어. 최신 Chrome으로 다시 열어줘."
      :"AI를 준비하지 못했어. 새로고침해서 다시 시도해줘.",0);
  }
}

async function streamReply(){
  const replyMsg=addMessage("bot","");
  const textEl=replyMsg.lastChild;
  let full="";
  const stream=await engine.chat.completions.create({
    messages:[{role:"system",content:SYSTEM_PROMPT},...history.slice(-10)],
    temperature:0.72,
    top_p:0.9,
    max_tokens:90,
    stream:true
  });
  for await(const chunk of stream){
    const delta=chunk.choices?.[0]?.delta?.content||"";
    if(!delta)continue;
    full+=delta;
    textEl.textContent=full;
    messagesEl.scrollTop=messagesEl.scrollHeight;
    hero.textContent=full;
  }
  return {full, el:replyMsg};
}

async function sendMessage(){
  const text=input.value.trim();
  if(!text||busy||!engine)return;
  busy=true;send.disabled=true;
  addMessage("user",text);
  history.push({role:"user",content:text});
  input.value="";resize();
  typing.classList.remove("hidden");
  characterArea.classList.add("talking");
  hero.textContent="잠깐만!";
  thinking.textContent="대답하는 중";
  try{
    const {full}=await streamReply();
    history.push({role:"assistant",content:full});
    hero.textContent=full;
    speak(full);
  }catch(e){
    console.error(e);
    const fallback="앗… 잠깐 버벅였어! 다시 말해줄래?";
    addMessage("bot",fallback);hero.textContent=fallback;speak(fallback);
  }finally{
    typing.classList.add("hidden");
    characterArea.classList.remove("talking");
    thinking.textContent="AI 온라인";
    busy=false;send.disabled=false;input.focus();
  }
}

/* 실제 성우의 음성을 복제하지 않고, 브라우저에서 더 밝고 높은 캐릭터 느낌으로 조정 */
function pickKoreanVoice(){
  const voices=speechSynthesis.getVoices();
  const ko=voices.filter(v=>(v.lang||"").toLowerCase().startsWith("ko"));
  return ko.find(v=>/google|sora|female|여성/i.test(v.name))||ko[0]||null;
}
function speak(text){
  if(!("speechSynthesis"in window))return;
  speechSynthesis.cancel();
  const clean=text.replace(/["“”*]/g,"").trim();
  const u=new SpeechSynthesisUtterance(clean);
  u.lang="ko-KR";
  u.rate=1.12;
  u.pitch=1.38;
  u.volume=1;
  const v=pickKoreanVoice();if(v)u.voice=v;
  characterArea.classList.add("talking");
  u.onend=()=>characterArea.classList.remove("talking");
  speechSynthesis.speak(u);
}
speechSynthesis?.addEventListener?.("voiceschanged",()=>{});

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){
  recognition=new SR();
  recognition.lang="ko-KR";recognition.continuous=false;recognition.interimResults=true;
  recognition.onstart=()=>{listening=true;mic.classList.add("recording");micStatus.textContent="🔴 듣고 있어… 말해줘!";};
  recognition.onresult=e=>{
    let finalText="", interim="";
    for(const r of e.results){if(r.isFinal)finalText+=r[0].transcript;else interim+=r[0].transcript;}
    input.value=finalText||interim;resize();
    if(finalText)sendMessage();
  };
  recognition.onerror=e=>{micStatus.textContent=e.error==="not-allowed"?"🎙️ 마이크 권한을 허용해줘.":"🎙️ 다시 눌러봐!";};
  recognition.onend=()=>{listening=false;mic.classList.remove("recording");if(!micStatus.textContent.includes("권한"))micStatus.textContent="🎙️ 마이크로 말할 수도 있어";};
  mic.onclick=()=>{if(!engine){micStatus.textContent="🎙️ AI 준비가 끝난 뒤 눌러줘!";return;}if(listening)recognition.stop();else{try{recognition.start()}catch(e){}}};
}else{mic.disabled=true;micStatus.textContent="🎙️ 이 브라우저는 음성인식을 지원하지 않아.";}

reset.onclick=()=>{
  speechSynthesis?.cancel();history=[];messagesEl.innerHTML="";
  const first="안녕! 다시 처음부터 이야기해볼까?";
  addMessage("bot",first);hero.textContent=first;input.value="";resize();
};

addMessage("bot","안녕! 빠른 AI를 준비하고 있어. 잠깐만 기다려줘!");
loadAI();
