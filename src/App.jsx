import React, { useState, useMemo, useEffect } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "firebase/auth";
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// ── 任務定義 ─────────────────────────────────────────────────────
// 諮詢階段（4項）
const CONSULT_ITEMS = [
  { id:1, phase:"報名前", task:"學校諮詢—提供學校資訊", role:"顧問" },
  { id:2, phase:"報名前", task:"提供報價單",             role:"顧問" },
  { id:3, phase:"報名前", task:"詢問學校床位資訊",       role:"行政" },
  { id:4, phase:"報名前", task:"學生決定報名與否",       role:"顧問", isDecision:true },
];

// 正式報名後追蹤（22項）
const ENROLL_ITEMS = [
  { id:5,  phase:"確定報名", task:"已收到學生提交的報名資料",                role:"行政" },
  { id:6,  phase:"確定報名", task:"已收到學生繳交的訂金 NT5,000",            role:"行政" },
  { id:7,  phase:"確定報名", task:"已完成學校端註冊報名",                    role:"行政" },
  { id:27, phase:"報名後",   task:"已提供遊學契約書",                        role:"顧問" },
  { id:10, phase:"報名後",   task:"已提供流程建議表",                        role:"顧問" },
  { id:8,  phase:"報名後",   task:"已提供學生入學信",                        role:"顧問" },
  { id:11, phase:"報名後",   task:"收到學生來回機票資訊",                    role:"顧問" },
  { id:12, phase:"報名後",   task:"提交給學校學生機票資訊",                  role:"行政" },
  { id:9,  phase:"報名後",   task:"已提供學生接機信",                        role:"顧問" },
  { id:13, phase:"報名後",   task:"辦理菲律賓簽證／所需護照",                role:"行政" },
  { id:28, phase:"報名後",   task:"學生已匯出尾款",                          role:"顧問" },
  { id:16, phase:"報名後",   task:"收到學費尾款",                            role:"行政" },
  { id:17, phase:"報名後",   task:"轉帳學費給學校",                          role:"行政" },
  { id:29, phase:"報名後",   task:"已提交匯款憑證給學校",                    role:"行政" },
  { id:14, phase:"報名後",   task:"辦理行前說明會",                          role:"顧問", defaultNote:"※若為男生，要注意是否為役男。若是要提醒辦理役男出國申請。" },
  { id:15, phase:"報名後",   task:"辦理手機 SIM 卡實名",                    role:"行政" },
  { id:22, phase:"出發前",   task:"和學校確認接機事宜",                      role:"行政" },
  { id:18, phase:"出發前",   task:"提醒＆確認學生是否已換匯＆建立緊急聯絡", role:"顧問" },
  { id:19, phase:"出發前",   task:"提醒學生是否已投保保險",                  role:"顧問" },
  { id:20, phase:"出發前",   task:"提醒學生是否線上提交役男出國申請",        role:"顧問" },
  { id:21, phase:"出發前",   task:"提供 E-Travel QR Code 給學生",            role:"顧問" },
  { id:23, phase:"出發日",   task:"確認學生班機狀態＆傳送提醒訊息",          role:"顧問" },
  { id:24, phase:"就讀中",   task:"已確認經理接到學生（有安排接機者）",      role:"顧問" },
  { id:25, phase:"就讀中",   task:"已寄發就讀分享意願表給學生",              role:"顧問" },
  { id:26, phase:"就讀中",   task:"已確認學生回台（有安排送機者）",          role:"顧問", isReturnPoint:true },
];

const CONSULT_PHASE_ORDER = ["報名前"];
const ENROLL_PHASE_ORDER  = ["確定報名","報名後","出發前","出發日","就讀中"];

const PHASE_CONFIG = {
  "報名前":   { color:"#6366f1", bg:"#eef2ff", icon:"🔍" },
  "確定報名": { color:"#f59e0b", bg:"#fffbeb", icon:"📝" },
  "報名後":   { color:"#3b82f6", bg:"#eff6ff", icon:"📬" },
  "出發前":   { color:"#8b5cf6", bg:"#f5f3ff", icon:"🧳" },
  "出發日":   { color:"#ec4899", bg:"#fdf2f8", icon:"✈️" },
  "就讀中":   { color:"#10b981", bg:"#ecfdf5", icon:"🏫" },
};

const ALL_STATUSES  = ["尚未進行","進行中","待確認","已完成"];
const STATUS_CONFIG = {
  "尚未進行":   { color:"#94a3b8", bg:"#f8fafc", border:"#e2e8f0" },
  "進行中":     { color:"#f59e0b", bg:"#fffbeb", border:"#fde68a" },
  "待確認":     { color:"#6366f1", bg:"#eef2ff", border:"#c7d2fe" },
  "已完成":     { color:"#10b981", bg:"#ecfdf5", border:"#6ee7b7" },
  "不報名結案": { color:"#ef4444", bg:"#fef2f2", border:"#fca5a5" },
  "已回國結案": { color:"#0284c7", bg:"#e0f2fe", border:"#7dd3fc" },
  "確定報名":   { color:"#059669", bg:"#ecfdf5", border:"#6ee7b7" },
};

const INIT_STUDENTS = [];

// ── 小元件 ────────────────────────────────────────────────────────
function Avatar({ name, size=36 }) {
  const txt=[...name].slice(0,2).join("");
  const cols=["#6366f1","#f59e0b","#10b981","#ec4899","#3b82f6","#8b5cf6","#ef4444","#06b6d4"];
  const c=cols[name.charCodeAt(0)%cols.length];
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:c,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#fff",fontSize:size*0.38,fontWeight:800}}>
      {txt}
    </div>
  );
}
function StatusBadge({ status }) {
  const cfg=STATUS_CONFIG[status]||STATUS_CONFIG["尚未進行"];
  return (
    <span style={{background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,
      borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
      {status}
    </span>
  );
}
function RoleTag({ role }) {
  return (
    <span style={{background:role==="顧問"?"#eef2ff":"#fffbeb",
      color:role==="顧問"?"#6366f1":"#d97706",
      border:`1px solid ${role==="顧問"?"#c7d2fe":"#fde68a"}`,
      borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
      {role}
    </span>
  );
}
function ProgressRing({ pct, size=52, color="#6366f1" }) {
  const r=(size-8)/2,circ=2*Math.PI*r,offset=circ*(1-pct/100);
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{transition:"stroke-dashoffset 0.5s ease",strokeLinecap:"round"}}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{transform:"rotate(90deg)",transformOrigin:"center",
          fill:"#0f172a",fontSize:size*0.22,fontWeight:800,fontFamily:"inherit"}}>
        {pct}%
      </text>
    </svg>
  );
}

// ── 編輯報名資料 Modal ────────────────────────────────────────────
function EditEnrolledModal({ student, onConfirm, onCancelEnroll, onCancel, consultantDB=[] }) {
  const [showCancelConfirm,setShowCancelConfirm]=useState(false);
  const [cancelNote,setCancelNote]=useState("");
  const [form,setForm]=useState({
    name:student.name||"",
    phone:student.phone||"",
    email:student.email||"",
    birthday:student.birthday||"",
    school:student.school||"",
    program:student.program||"",
    room:student.room||"",
    weeks:student.weeks||"",
    departDate:student.departDate||"",
    returnDate:student.returnDate||"",
    consultant:student.consultant||"",
    priority:student.priority||"medium",
    enrollDate:student.enrollDate||"",
    commission:student.commission||"",
    sharedNote:student.sharedNote||"",
    adminService:student.adminService||"",
    postageFee:student.postageFee||"",
  });
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const calcReturn=(depart,weeks)=>{
    if(!depart||!weeks||isNaN(Number(weeks)))return "";
    const d=new Date(depart);
    d.setDate(d.getDate()+Number(weeks)*7-1);
    return d.toISOString().split("T")[0];
  };
  const onDepartChange=(v)=>{
    const ret=calcReturn(v,form.weeks);
    setForm(p=>({...p,departDate:v,returnDate:ret||p.returnDate}));
  };
  const onWeeksChange=(v)=>{
    const ret=calcReturn(form.departDate,v);
    setForm(p=>({...p,weeks:v,returnDate:ret||p.returnDate}));
  };
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",
    fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",
    width:"100%",boxSizing:"border-box",color:"#0f172a"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onCancel}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:600,maxWidth:"95vw",
        maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.2)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:12,background:"#ecfdf5",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>✏️</div>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#0f172a"}}>編輯報名資料</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:2}}>
              學生：<strong>{student.name}</strong>　修改後任務預計日期將自動重算
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {/* 學生來源（唯讀顯示） */}
          <div style={{gridColumn:"1/-1",background:student.studentSource==="self"?"#f0fdf4":student.studentSource==="company"?"#eff6ff":"#f8fafc",
            border:`1px solid ${student.studentSource==="self"?"#6ee7b7":student.studentSource==="company"?"#bfdbfe":"#e2e8f0"}`,
            borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:4}}>📣 學生來源</div>
            <div style={{fontSize:13,fontWeight:700,color:student.studentSource==="self"?"#059669":student.studentSource==="company"?"#2563eb":"#374151"}}>
              {student.studentSource==="self"
                ?`🤝 自行開發${student.selfSourceNote?" — "+student.selfSourceNote:""}`
                :student.studentSource==="company"
                  ?`🏢 公司來源${student.companySourceDetail?" — "+student.companySourceDetail:""}`
                  :"—（未填）"}
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>姓名</label>
            <input value={form.name} onChange={e=>f("name",e.target.value)} style={inp}/>
          </div>
          {[["電話","phone","text"],["Email","email","email"],
            ["負責顧問","consultant","text"]].map(([lb,k,tp])=>(
            <div key={k}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>{lb}</label>
              <input type={tp} value={form[k]} onChange={e=>f(k,e.target.value)} style={inp}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>優先度</label>
            <select value={form.priority} onChange={e=>f("priority",e.target.value)} style={inp}>
              <option value="high">緊急</option><option value="medium">一般</option><option value="low">低</option>
            </select>
          </div>
          {[["申請學校","school","text"],["申請課程","program","text"],["房型","room","text"]].map(([lb,k,tp])=>(
            <div key={k}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>{lb}</label>
              <input type={tp} value={form[k]} onChange={e=>f(k,e.target.value)} style={inp}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>就讀週數</label>
            <input type="number" value={form.weeks} onChange={e=>onWeeksChange(e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>✈️ 出發日期</label>
            <input type="date" value={form.departDate} onChange={e=>onDepartChange(e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              🏠 回程日期
              <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（可手動修改）</span>
            </label>
            <input type="date" value={form.returnDate} onChange={e=>f("returnDate",e.target.value)}
              style={{...inp,borderColor:form.returnDate?"#6ee7b7":"#e2e8f0",
                background:form.returnDate?"#f0fdf4":"#fff"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📅 報名日期
              <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（已收定金日）</span>
            </label>
            <input type="date" value={form.enrollDate} onChange={e=>f("enrollDate",e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              💰 預計佣金（USD）
            </label>
            <input type="number" value={form.commission} onChange={e=>f("commission",e.target.value)}
              placeholder="例：150" style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📣 學生來源
            </label>
            <div style={{...inp,background:"#f8fafc",color:"#374151",cursor:"default",padding:"7px 12px"}}>
              {student.studentSource==="self"
                ?`🤝 自行開發${student.selfSourceNote?" — "+student.selfSourceNote:""}`
                :student.studentSource==="company"
                  ?`🏢 公司來源${student.companySourceDetail?" — "+student.companySourceDetail:""}`
                  :"—（未填）"}
            </div>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              🎂 學生生日 <span style={{color:"#ef4444"}}>*</span>
            </label>
            <input type="date" value={form.birthday} onChange={e=>f("birthday",e.target.value)} style={{...inp,borderColor:form.birthday?"#e2e8f0":"#fca5a5"}} required/>
          </div>
          {/* 行政協助欄位 */}
          {(()=>{
            const consultantInfo=consultantDB.find(c=>c.name===form.consultant);
            const isParttimeConsultant=consultantInfo?.employmentType==="parttime";
            const disabledStyle={...inp,background:"#f1f5f9",color:"#94a3b8",cursor:"not-allowed",borderStyle:"dashed"};
            return (
              <div style={{gridColumn:"1/-1",background:isParttimeConsultant?"#fef9c3":"#f8fafc",
                border:`1.5px solid ${isParttimeConsultant?"#fde68a":"#e2e8f0"}`,
                borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontWeight:800,fontSize:13,
                  color:isParttimeConsultant?"#92400e":"#94a3b8",marginBottom:10}}>
                  🗂 行政協助費用
                  {!isParttimeConsultant&&<span style={{fontWeight:400,marginLeft:8,fontSize:11}}>
                    （全職顧問不適用，欄位鎖定）
                  </span>}
                  {isParttimeConsultant&&<span style={{fontWeight:400,marginLeft:8,fontSize:11,color:"#92400e"}}>
                    ＊兼職顧問必填，第一階段獎金將自動扣除
                  </span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{fontSize:11,color:isParttimeConsultant?"#64748b":"#94a3b8",fontWeight:700,display:"block",marginBottom:4}}>
                      行政協助類型 {isParttimeConsultant&&<span style={{color:"#ef4444"}}>*</span>}
                    </label>
                    {isParttimeConsultant
                      ?<select value={form.adminService} onChange={e=>f("adminService",e.target.value)} style={inp}>
                          <option value="">— 請選擇 —</option>
                          <option value="basic">基礎協助（代送/寄）NT$ 500</option>
                          <option value="full">全包行政服務 NT$ 1,000</option>
                        </select>
                      :<div style={disabledStyle}>—</div>
                    }
                    {form.adminService==="basic"&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>
                      簽證代送簽、領件及掛號寄回學生
                    </div>}
                    {form.adminService==="full"&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>
                      簽證填寫、代送/領件、eTravel、機票協助、行李須知
                    </div>}
                  </div>
                  <div>
                    <label style={{fontSize:11,color:isParttimeConsultant?"#64748b":"#94a3b8",fontWeight:700,display:"block",marginBottom:4}}>
                      郵寄費用（NT$）{isParttimeConsultant&&<span style={{color:"#94a3b8",fontWeight:400}}> 行政人員填入</span>}
                    </label>
                    {isParttimeConsultant
                      ?<input type="number" value={form.postageFee} onChange={e=>f("postageFee",e.target.value)}
                          placeholder="例：150" style={inp} min="0"/>
                      :<div style={disabledStyle}>—</div>
                    }
                  </div>
                  {isParttimeConsultant&&form.adminService&&(
                    <div style={{gridColumn:"1/-1",background:"#fff7ed",borderRadius:8,
                      padding:"8px 12px",fontSize:12,color:"#92400e"}}>
                      💰 第一階段獎金將扣除：行政費 NT${form.adminService==="basic"?500:1000}
                      {form.postageFee?` + 郵寄費 NT${form.postageFee}`:""}
                      {" "}= NT${(form.adminService==="basic"?500:1000)+Number(form.postageFee||0)}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>📝 共用備註</label>
            <textarea value={form.sharedNote} onChange={e=>f("sharedNote",e.target.value)}
              style={{...inp,height:64,resize:"vertical",lineHeight:1.6}}/>
          </div>
        </div>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,
          padding:"10px 14px",marginTop:14,fontSize:12,color:"#92400e"}}>
          ⚠️ 修改出發日期或報名日期後，尚未完成的任務預計日期將依新日期自動重算。已完成的任務日期不受影響。
        </div>
        {/* 取消報名區塊 */}
        {!showCancelConfirm
          ?<button onClick={()=>setShowCancelConfirm(true)}
              style={{background:"#fef2f2",color:"#ef4444",border:"1.5px solid #fca5a5",borderRadius:8,
                padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                width:"100%",marginTop:12}}>
              🚫 學生取消報名結案
            </button>
          :<div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:14,marginTop:12}}>
            <div style={{fontWeight:700,color:"#ef4444",fontSize:13,marginBottom:8}}>確認取消報名結案</div>
            {(()=>{
              const cancelConsultant=consultantDB.find(c=>c.name===form.consultant);
              const isCancelParttime=cancelConsultant?.employmentType==="parttime";
              return (
                <div style={{fontSize:12,color:"#7f1d1d",marginBottom:8,lineHeight:1.6}}>
                  ⚠️ 結案後，該學生的佣金將從<strong>取消當月業績中扣除</strong>。<br/>
                  · 若已支付前期獎金 → 於<strong>取消{isCancelParttime?"當月25日":"次月10日"}</strong>薪資中扣回<br/>
                  · 後期獎金 → <strong>全部取消，不予發放</strong>
                </div>
              );
            })()}
            <textarea value={cancelNote} onChange={e=>setCancelNote(e.target.value)}
              placeholder="取消原因（選填）..."
              style={{border:"1.5px solid #fca5a5",borderRadius:8,padding:"8px 10px",fontSize:12,
                fontFamily:"inherit",outline:"none",background:"#fff",width:"100%",
                boxSizing:"border-box",height:56,resize:"vertical",lineHeight:1.6,marginBottom:10}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>onCancelEnroll({...form,cancelNote,cancelDate:new Date().toISOString().split("T")[0]})}
                style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,
                  padding:"9px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flex:1}}>
                確認取消報名結案
              </button>
              <button onClick={()=>setShowCancelConfirm(false)}
                style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,
                  padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                返回
              </button>
            </div>
          </div>
        }
        <div style={{display:"flex",gap:10,marginTop:12}}>
          <button onClick={()=>onConfirm(form)}
            style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,
              padding:"11px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flex:1}}>
            💾 儲存修改
          </button>
          <button onClick={onCancel}
            style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,
              padding:"11px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 升級 Modal ────────────────────────────────────────────────────
function UpgradeModal({ student, onConfirm, onClose, onCancel, consultantDB=[] }) {
  // 從諮詢資料預帶入最後決定學校的詳細資訊
  const initSchoolData=(()=>{
    const chosen=student.chosenSchool||"";
    const opts=student.schoolOptions||[];
    const matched=opts.find(s=>s.school===chosen);
    return {
      school: matched?.school || student.school || "We Academy",
      program: matched?.program || student.program || "",
      room: matched?.room || student.room || "",
    };
  })();
  const [form,setForm]=useState({
    ...initSchoolData,
    departDate:student.departDate||"",
    returnDate:student.returnDate||"",weeks:student.weeks||"",
    consultant:student.consultant||"",
    priority:student.priority||"medium",
    enrollDate:new Date().toISOString().split("T")[0],
    commission:"",
    birthday:student.birthday||"",
    adminService:"",
    postageFee:"",
    closeNote:"",
    consultNote:student.consultNote||"",
    schoolList:student.schoolList||"",
    chosenSchool:student.chosenSchool||"",
  });
  // 當選擇最後決定學校時，自動帶入課程＆房型
  const onChosenSchoolChange=(val)=>{
    const opts=student.schoolOptions||[];
    const matched=opts.find(s=>s.school===val);
    setForm(p=>({
      ...p,
      chosenSchool:val,
      school: matched?.school || val,
      program: matched?.program || p.program,
      room: matched?.room || p.room,
    }));
  };
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",
    fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",
    width:"100%",boxSizing:"border-box",color:"#0f172a"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onCancel}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:560,maxWidth:"95vw",
        maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.2)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:12,background:"#ecfdf5",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🎉</div>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#0f172a"}}>確認升級為正式報名</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:2}}>
              學生：<strong>{student.name}</strong>　請補充或確認以下報名資訊
            </div>
          </div>
        </div>
        {/* 諮詢紀錄區塊 */}
        <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:800,color:"#475569",marginBottom:10}}>🔍 諮詢紀錄</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>諮詢備註</label>
              <textarea value={form.consultNote} onChange={e=>f("consultNote",e.target.value)}
                placeholder="諮詢過程重點記錄..." style={{...inp,height:64,resize:"vertical",lineHeight:1.6}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>提供的學校清單</label>
              <textarea value={form.schoolList} onChange={e=>f("schoolList",e.target.value)}
                placeholder="例：We Academy、PINES、OHR English..." style={{...inp,height:52,resize:"vertical",lineHeight:1.6}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>✅ 最後決定就讀學校</label>
              {(student.schoolOptions||[]).filter(s=>s.school.trim()).length>0
                ?<select value={form.chosenSchool} onChange={e=>onChosenSchoolChange(e.target.value)} style={inp}>
                  <option value="">— 尚未決定 —</option>
                  {(student.schoolOptions||[]).filter(s=>s.school.trim()).map((s,i)=>(
                    <option key={i} value={s.school}>
                      {s.school}{s.program?" ／ "+s.program:""}{s.room?" ／ "+s.room:""}
                    </option>
                  ))}
                </select>
                :<input value={form.chosenSchool} onChange={e=>onChosenSchoolChange(e.target.value)}
                  placeholder="學生最終選擇的學校" style={inp}/>
              }
              {form.chosenSchool&&(student.schoolOptions||[]).find(s=>s.school===form.chosenSchool)&&(
                <div style={{fontSize:11,color:"#059669",marginTop:4,background:"#ecfdf5",borderRadius:6,padding:"4px 9px",border:"1px solid #6ee7b7"}}>
                  ✅ 已自動帶入下方「申請學校／課程／房型」
                </div>
              )}
            </div>
          </div>
        </div>
        {/* 報名資訊 */}
        {/* 學生來源（最上方） */}
        <div style={{background:student.studentSource==="self"?"#f0fdf4":student.studentSource==="company"?"#eff6ff":"#f8fafc",
          border:`1px solid ${student.studentSource==="self"?"#6ee7b7":student.studentSource==="company"?"#bfdbfe":"#e2e8f0"}`,
          borderRadius:9,padding:"10px 14px",marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:3}}>📣 學生來源</div>
          <div style={{fontSize:13,fontWeight:700,color:student.studentSource==="self"?"#059669":student.studentSource==="company"?"#2563eb":"#374151"}}>
            {student.studentSource==="self"
              ?`🤝 自行開發${student.selfSourceNote?" — "+student.selfSourceNote:""}`
              :student.studentSource==="company"
                ?`🏢 公司來源${student.companySourceDetail?" — "+student.companySourceDetail:""}`
                :"—（未填）"}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["申請學校","school","text"],["申請課程","program","text"],
            ["房型","room","text"],["就讀週數","weeks","number"],
            ["出發日期","departDate","date"],["回程日期","returnDate","date"],
            ["負責顧問","consultant","text"]].map(([label,key,type])=>(
            <div key={key}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>{label}</label>
              <input type={type} value={form[key]} onChange={e=>f(key,e.target.value)} style={inp}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>優先度</label>
            <select value={form.priority} onChange={e=>f("priority",e.target.value)} style={inp}>
              <option value="high">緊急</option><option value="medium">一般</option><option value="low">低</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📅 報名日期 <span style={{color:"#ef4444"}}>*</span>
              <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（已收定金日）</span>
            </label>
            <input type="date" value={form.enrollDate} onChange={e=>f("enrollDate",e.target.value)} style={inp}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📣 學生來源
            </label>
            <div style={{...inp,background:"#f8fafc",color:"#374151",cursor:"default"}}>
              {student.studentSource==="self"
                ?`🤝 自行開發${student.selfSourceNote?" — "+student.selfSourceNote:""}`
                :student.studentSource==="company"
                  ?`🏢 公司來源${student.companySourceDetail?" — "+student.companySourceDetail:""}`
                  :"—"}
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              💰 預計佣金金額
              <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（USD）</span>
            </label>
            <input type="number" value={form.commission} onChange={e=>f("commission",e.target.value)}
              placeholder="例：150" style={inp}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              🎂 學生生日 <span style={{color:"#ef4444"}}>*</span>
            </label>
            <input type="date" value={form.birthday} onChange={e=>f("birthday",e.target.value)}
              style={{...inp,borderColor:form.birthday?"#e2e8f0":"#fca5a5"}} required/>
          </div>
          {/* 行政協助欄位 */}
          {(()=>{
            const consultantInfo=consultantDB.find(c=>c.name===form.consultant);
            const isParttimeConsultant=consultantInfo?.employmentType==="parttime";
            const disabledStyle={...inp,background:"#f1f5f9",color:"#94a3b8",cursor:"not-allowed",borderStyle:"dashed"};
            const adminFeeAmt=form.adminService==="basic"?500:form.adminService==="full"?1000:0;
            const totalDeduct=adminFeeAmt+Number(form.postageFee||0);
            return (
              <div style={{gridColumn:"1/-1",background:isParttimeConsultant?"#fef9c3":"#f8fafc",
                border:`1.5px solid ${isParttimeConsultant?"#fde68a":"#e2e8f0"}`,
                borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontWeight:800,fontSize:12,
                  color:isParttimeConsultant?"#92400e":"#94a3b8",marginBottom:8}}>
                  🗂 行政協助費用
                  {!isParttimeConsultant&&<span style={{fontWeight:400,marginLeft:6,fontSize:11}}>（全職顧問不適用）</span>}
                  {isParttimeConsultant&&<span style={{color:"#ef4444",marginLeft:4}}>＊必填</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{fontSize:11,color:isParttimeConsultant?"#64748b":"#94a3b8",
                      fontWeight:700,display:"block",marginBottom:4}}>行政協助類型</label>
                    {isParttimeConsultant
                      ?<select value={form.adminService} onChange={e=>f("adminService",e.target.value)} style={inp}>
                          <option value="">— 請選擇 —</option>
                          <option value="basic">基礎協助（代送/寄）NT$ 500</option>
                          <option value="full">全包行政服務 NT$ 1,000</option>
                        </select>
                      :<div style={disabledStyle}>—（全職顧問無需填寫）</div>
                    }
                    {form.adminService==="basic"&&<div style={{fontSize:10,color:"#64748b",marginTop:3}}>
                      簽證代送簽、領件及掛號寄回學生
                    </div>}
                    {form.adminService==="full"&&<div style={{fontSize:10,color:"#64748b",marginTop:3}}>
                      簽證填寫、代送/領件、eTravel、機票協助、行李須知
                    </div>}
                  </div>
                  <div>
                    <label style={{fontSize:11,color:isParttimeConsultant?"#64748b":"#94a3b8",
                      fontWeight:700,display:"block",marginBottom:4}}>郵寄費用（NT$）</label>
                    {isParttimeConsultant
                      ?<input type="number" min="0" value={form.postageFee}
                          onChange={e=>f("postageFee",e.target.value)}
                          placeholder="例：150" style={inp}/>
                      :<div style={disabledStyle}>—</div>
                    }
                  </div>
                  {isParttimeConsultant&&form.adminService&&(
                    <div style={{gridColumn:"1/-1",background:"#fff7ed",border:"1px solid #fed7aa",
                      borderRadius:7,padding:"7px 12px",fontSize:12,color:"#92400e"}}>
                      💰 第一階段獎金將扣除：
                      行政費 NT${adminFeeAmt.toLocaleString()}
                      {Number(form.postageFee)>0&&` ＋ 郵寄費 NT${form.postageFee}`}
                      {" "}＝ 合計 NT${totalDeduct.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📝 備註
              <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（注意事項、不報名結案原因等）</span>
            </label>
            <textarea value={form.closeNote} onChange={e=>f("closeNote",e.target.value)}
              placeholder="例：學生說預算不足暫不考慮、已失去聯繫..."
              style={{...inp,height:72,resize:"vertical",lineHeight:1.6}}/>
          </div>
        </div>
        <div style={{background:"#ecfdf5",border:"1px solid #6ee7b7",borderRadius:10,
          padding:"10px 14px",marginTop:16,fontSize:13,color:"#065f46"}}>
          ✅ 升級後，學生將出現在「正式報名」清單，並開始「確定報名」後的 22 項追蹤流程。
        </div>
        <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={()=>onConfirm(form)}
            style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,
              padding:"11px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flex:2,minWidth:180}}>
            🎉 確認升級為正式報名
          </button>
          <button onClick={()=>onClose(form,"notEnroll")}
            style={{background:"#fef2f2",color:"#ef4444",border:"1.5px solid #fca5a5",borderRadius:8,
              padding:"11px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flex:1,minWidth:140}}>
            🚫 不報名結案
          </button>
          <button onClick={()=>onClose(form,"noContact")}
            style={{background:"#f8fafc",color:"#64748b",border:"1.5px solid #e2e8f0",borderRadius:8,
              padding:"11px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flex:1,minWidth:140}}>
            📵 聯繫不上結案
          </button>
          <button onClick={onCancel}
            style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,
              padding:"11px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 新增學生 Modal ────────────────────────────────────────────────
function AddStudentModal({ mode, prefill, onConfirm, onCancel, schoolDB=[], consultantDB=[], currentRole="manager", currentUser="" }) {
  const isEnroll=mode==="enrolled";
  const isEdit=!!prefill;
  const [form,setForm]=useState({
    name:prefill?.name||"",phone:prefill?.phone||"",email:prefill?.email||"",
    studentSource:prefill?.studentSource||"company",
    companySourceDetail:prefill?.companySourceDetail||"",
    selfSourceNote:prefill?.selfSourceNote||"",
    school:prefill?.school||"We Academy",program:prefill?.program||"",room:prefill?.room||"",
    departDate:prefill?.departDate||"",returnDate:prefill?.returnDate||"",weeks:prefill?.weeks||"",
    consultant:prefill?.consultant||(currentRole==="consultant"?currentUser:"")||"",
    priority:prefill?.priority||"medium",sharedNote:prefill?.sharedNote||"",
    enrollDate:prefill?.enrollDate||"",commission:prefill?.commission||"",
    consultNote:prefill?.consultNote||"",chosenSchool:prefill?.chosenSchool||"",
    consultChosenSchool:prefill?.school||"",consultChosenProgram:prefill?.program||"",consultChosenRoom:prefill?.room||"",
    consultDate:prefill?.consultDate||new Date().toISOString().split("T")[0],
    consultDepartDate:prefill?.consultDepartDate||prefill?.departDate||"",
    consultWeeks:prefill?.consultWeeks||prefill?.weeks||"",
    consultReturnDate:prefill?.consultReturnDate||prefill?.returnDate||"",
  });
  const [schoolOptions,setSchoolOptions]=useState(
    prefill?.schoolOptions?.length
      ? prefill.schoolOptions
      : [{school:"",program:"",room:"",note:""},{school:"",program:"",room:"",note:""},{school:"",program:"",room:"",note:""}]
  );
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const calcReturn=(depart,weeks)=>{
    if(!depart||!weeks||isNaN(Number(weeks)))return "";
    const d=new Date(depart);
    d.setDate(d.getDate()+Number(weeks)*7-1);
    return d.toISOString().split("T")[0];
  };
  const onDepartChange=(v)=>{
    const ret=calcReturn(v,form.consultWeeks);
    setForm(p=>({...p,consultDepartDate:v,consultReturnDate:ret}));
  };
  const onWeeksChange=(v)=>{
    const ret=calcReturn(form.consultDepartDate,v);
    setForm(p=>({...p,consultWeeks:v,consultReturnDate:ret}));
  };
  const updSchool=(idx,k,v)=>setSchoolOptions(prev=>prev.map((s,i)=>i===idx?{...s,[k]:v}:s));
  const addSchoolRow=()=>setSchoolOptions(prev=>[...prev,{school:"",program:"",room:"",note:""}]);
  const removeSchoolRow=(idx)=>setSchoolOptions(prev=>prev.filter((_,i)=>i!==idx));
  const filledSchools=schoolOptions.filter(s=>s.school.trim());
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",
    fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",
    width:"100%",boxSizing:"border-box",color:"#0f172a"};
  const sinp={border:"1.5px solid #e2e8f0",borderRadius:7,padding:"6px 9px",
    fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff",
    width:"100%",boxSizing:"border-box",color:"#0f172a"};

  const handleConfirm=()=>{
    if(!form.name.trim())return;
    const schoolListStr=filledSchools.map(s=>[s.school,s.program,s.room,s.note].filter(Boolean).join(" / ")).join("\n");
    onConfirm({...form,schoolList:schoolListStr,schoolOptions},mode);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onCancel}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:680,maxWidth:"96vw",
        maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.2)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:12,
            background:isEnroll?"#ecfdf5":"#eef2ff",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
            {isEnroll?"📝":"🔍"}
          </div>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#0f172a"}}>
              {isEdit?"✏️ 編輯諮詢學生資料":`新增${isEnroll?"正式報名":"諮詢"}學生`}
            </div>
            <div style={{fontSize:13,color:"#64748b",marginTop:2}}>
              {isEdit?"修改學生的諮詢資料，儲存後立即更新":isEnroll?"填寫完整報名資訊，直接進入報名追蹤流程":"填寫基本資料，進入諮詢追蹤流程"}
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {/* 學生來源 */}
          <div style={{gridColumn:"1/-1",background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:10,padding:"12px 14px"}}>
            <label style={{fontSize:11,color:"#059669",fontWeight:800,display:"block",marginBottom:8}}>📣 學生來源</label>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {[["company","🏢 公司來源（Company Lead）"],["self","🤝 自行開發（Self-sourced）"]].map(([v,lb])=>(
                <label key={v} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                  background:form.studentSource===v?"#fff":"transparent",
                  border:`1.5px solid ${form.studentSource===v?"#059669":"#d1fae5"}`,
                  borderRadius:8,padding:"6px 12px",fontSize:13,fontWeight:form.studentSource===v?700:500,
                  color:form.studentSource===v?"#059669":"#374151"}}>
                  <input type="radio" name="studentSource" value={v}
                    checked={form.studentSource===v} onChange={()=>f("studentSource",v)}
                    style={{accentColor:"#059669"}}/>
                  {lb}
                </label>
              ))}
            </div>
            {form.studentSource==="company"&&(
              <div>
                <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>得知透客遊學的管道</label>
                <select value={form.companySourceDetail} onChange={e=>f("companySourceDetail",e.target.value)} style={{...inp,background:"#fff"}}>
                  <option value="">— 請選擇 —</option>
                  {["Google 搜尋","AI 建議","FB 廣告","Instagram","官網","朋友/舊生介紹","舊生","其他"].map(s=>(
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            {form.studentSource==="self"&&(
              <div>
                <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>備註（如：周遭朋友、親戚等）</label>
                <input value={form.selfSourceNote} onChange={e=>f("selfSourceNote",e.target.value)}
                  placeholder="例：顧問的朋友介紹" style={{...inp,background:"#fff"}}/>
              </div>
            )}
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>姓名 *</label>
            <input value={form.name} onChange={e=>f("name",e.target.value)} style={inp} placeholder="學生姓名"/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>📅 諮詢日期</label>
            <input type="date" value={form.consultDate} onChange={e=>f("consultDate",e.target.value)} style={inp}/>
          </div>
          {[["電話","phone","text"],["Email","email","email"]].map(([label,key,type])=>(
            <div key={key}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>{label}</label>
              <input type={type} value={form[key]} onChange={e=>f(key,e.target.value)} style={inp}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>負責顧問</label>
            {currentRole==="consultant"
              ?<div style={{...inp,background:"#f8fafc",color:"#64748b",borderStyle:"dashed",cursor:"default"}}>
                  {currentUser}
                </div>
              :<select value={form.consultant} onChange={e=>f("consultant",e.target.value)} style={inp}>
                  <option value="">— 請選擇顧問 —</option>
                  {consultantDB.filter(m=>m.role==="consultant"||m.role==="manager").map(m=>(
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
            }
          </div>
          <div>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>優先度</label>
            <select value={form.priority} onChange={e=>f("priority",e.target.value)} style={inp}>
              <option value="high">緊急</option><option value="medium">一般</option><option value="low">低</option>
            </select>
          </div>

          {/* ── 正式報名專屬欄位 ── */}
          {isEnroll && [["申請學校","school","text"],["申請課程","program","text"],
            ["房型","room","text"],["就讀週數","weeks","number"],
            ["出發日期","departDate","date"],["回程日期","returnDate","date"]].map(([label,key,type])=>(
            <div key={key}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>{label}</label>
              <input type={type} value={form[key]} onChange={e=>f(key,e.target.value)} style={inp}/>
            </div>
          ))}
          {isEnroll && <>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
                📅 報名日期 <span style={{color:"#ef4444"}}>*</span>
                <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（已收定金日）</span>
              </label>
              <input type="date" value={form.enrollDate} onChange={e=>f("enrollDate",e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
                💰 預計佣金金額
                <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（USD）</span>
              </label>
              <input type="number" value={form.commission} onChange={e=>f("commission",e.target.value)}
                placeholder="例：150" style={inp}/>
            </div>
          </>}

          {/* ── 諮詢專屬欄位 ── */}
          {!isEnroll && <>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>✈️ 預計出發日期</label>
              <input type="date" value={form.consultDepartDate} onChange={e=>onDepartChange(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>📆 預計就讀週數</label>
              <input type="number" min="1" max="52" value={form.consultWeeks} onChange={e=>onWeeksChange(e.target.value)} placeholder="例：4" style={inp}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
                🏠 預計回程日期
                <span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>（出發日＋週數×7–1天自動推算，可手動修改）</span>
              </label>
              <input type="date" value={form.consultReturnDate} onChange={e=>f("consultReturnDate",e.target.value)}
                style={{...inp,borderColor:form.consultReturnDate?"#6ee7b7":"#e2e8f0",
                  background:form.consultReturnDate?"#f0fdf4":"#fff"}}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>📝 諮詢備註</label>
              <textarea value={form.consultNote} onChange={e=>f("consultNote",e.target.value)}
                placeholder="諮詢過程重點記錄..."
                style={{...inp,height:60,resize:"vertical",lineHeight:1.6}}/>
            </div>

            {/* 學校清單 */}
            <div style={{gridColumn:"1/-1"}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:8}}>🏫 提供的學校清單</label>
              <div style={{border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1.2fr 28px",
                  background:"#f8fafc",padding:"6px 10px",gap:6,borderBottom:"1px solid #e2e8f0"}}>
                  {["學校名稱","課程","房型","備註",""].map((h,i)=>(
                    <div key={i} style={{fontSize:11,color:"#64748b",fontWeight:700}}>{h}</div>
                  ))}
                </div>
                {schoolOptions.map((row,idx)=>{
                  const isManual=row.manual;
                  const dbSchool=schoolDB.find(s=>s.name===row.school);
                  return (
                    <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1.2fr 28px",
                      padding:"7px 10px",gap:6,
                      borderBottom:idx<schoolOptions.length-1?"1px solid #f1f5f9":"none",
                      background:isManual?"#fffbeb":idx%2===0?"#fff":"#fafafa"}}>
                      {/* 學校名稱：DB選單 or 手動 */}
                      {isManual
                        ?<input value={row.school} onChange={e=>updSchool(idx,"school",e.target.value)}
                            placeholder="手動輸入學校名稱" style={{...sinp,borderColor:"#fde68a",background:"#fffbeb"}}/>
                        :<select value={row.school} onChange={e=>{
                            const sel=schoolDB.find(s=>s.name===e.target.value);
                            updSchool(idx,"school",e.target.value);
                            if(sel){updSchool(idx,"program","");updSchool(idx,"room","");}
                          }} style={sinp}>
                            <option value="">— 選擇學校 —</option>
                            {schoolDB.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                      }
                      {/* 課程 */}
                      {isManual||!dbSchool
                        ?<input value={row.program} onChange={e=>updSchool(idx,"program",e.target.value)}
                            placeholder="課程" style={isManual?{...sinp,borderColor:"#fde68a",background:"#fffbeb"}:sinp}/>
                        :<select value={row.program} onChange={e=>updSchool(idx,"program",e.target.value)} style={sinp}>
                            <option value="">— 選擇課程 —</option>
                            {dbSchool.programs.map((p,i)=><option key={i} value={p}>{p}</option>)}
                          </select>
                      }
                      {/* 房型 */}
                      {isManual||!dbSchool
                        ?<input value={row.room} onChange={e=>updSchool(idx,"room",e.target.value)}
                            placeholder="房型" style={isManual?{...sinp,borderColor:"#fde68a",background:"#fffbeb"}:sinp}/>
                        :<select value={row.room} onChange={e=>updSchool(idx,"room",e.target.value)} style={sinp}>
                            <option value="">— 選擇房型 —</option>
                            {dbSchool.rooms.map((r,i)=><option key={i} value={r}>{r}</option>)}
                          </select>
                      }
                      <input value={row.note} onChange={e=>updSchool(idx,"note",e.target.value)}
                        placeholder="備註..." style={sinp}/>
                      <button onClick={()=>removeSchoolRow(idx)}
                        style={{background:"transparent",border:"none",cursor:"pointer",
                          color:"#94a3b8",fontSize:15,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                    </div>
                  );
                })}
                <div style={{padding:"8px 10px",borderTop:"1px dashed #e2e8f0",display:"flex",gap:10}}>
                  <button onClick={addSchoolRow}
                    style={{background:"transparent",border:"none",cursor:"pointer",
                      color:"#6366f1",fontSize:12,fontWeight:700,fontFamily:"inherit",padding:0}}>
                    ＋ 從學校資料庫新增
                  </button>
                  <button onClick={()=>setSchoolOptions(prev=>[...prev,{school:"",program:"",room:"",note:"",manual:true}])}
                    style={{background:"transparent",border:"none",cursor:"pointer",
                      color:"#d97706",fontSize:12,fontWeight:700,fontFamily:"inherit",padding:0}}>
                    ✏️ 手動輸入新增學校
                  </button>
                </div>
              </div>
            </div>

            {/* 最後決定 */}
            <div style={{gridColumn:"1/-1"}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>✅ 最後決定就讀學校</label>
              <select value={form.chosenSchool} onChange={e=>{
                const val=e.target.value;
                const matched=filledSchools.find(s=>s.school===val);
                setForm(p=>({...p,chosenSchool:val,
                  consultChosenSchool:val,
                  consultChosenProgram:matched?.program||"",
                  consultChosenRoom:matched?.room||"",
                }));
              }} style={inp}>
                <option value="">— 尚未決定 —</option>
                {filledSchools.map((s,i)=>(
                  <option key={i} value={s.school}>
                    {s.school}{s.program?" ／ "+s.program:""}{s.room?" ／ "+s.room:""}
                  </option>
                ))}
              </select>
            </div>
          </>}

          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>
              📝 共用備註（顧問＆行政共享）
            </label>
            <textarea value={form.sharedNote} onChange={e=>f("sharedNote",e.target.value)}
              placeholder="記錄學生特殊需求、注意事項..."
              style={{...inp,height:64,resize:"vertical",lineHeight:1.6}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={handleConfirm}
            style={{background:isEdit?"#6366f1":isEnroll?"#059669":"#6366f1",color:"#fff",border:"none",
              borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",flex:1}}>
            {isEdit?"💾 儲存修改":`＋ 新增${isEnroll?"正式報名":"諮詢"}學生`}
          </button>
          <button onClick={onCancel}
            style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,
              padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────
export default function App() {
  // ── 登入狀態 ──────────────────────────────────────────
  const [isLoggedIn,setIsLoggedIn]   = useState(false);
  const [loginEmail,setLoginEmail]   = useState("");
  const [loginPwd,setLoginPwd]       = useState("");
  const [loginErr,setLoginErr]       = useState("");
  const [mustChangePwd,setMustChangePwd] = useState(false);
  const [newPwd,setNewPwd]           = useState("");
  const [newPwd2,setNewPwd2]         = useState("");
  const [changePwdErr,setChangePwdErr]   = useState("");
  const [forgotMode,setForgotMode]   = useState(false);
  const [forgotEmail,setForgotEmail] = useState("");
  const [forgotSent,setForgotSent]   = useState(false);

  const [view,setView]             = useState("consult");
  const [students,setStudents]     = useState(INIT_STUDENTS);
  const [currentRole,setCurrentRole] = useState("manager"); // manager | consultant | admin
  const [exchangeRates,setExchangeRates] = useState({}); // key: "YYYY-MM", value: number
  const [payStatus,setPayStatus]         = useState({}); // key: "sid_incentive/phase1/phase2" -> "待發放"|"已發放"|"已扣回"
  const getPayStatus=(sid,type)=>payStatus[`${sid}_${type}`]||"待發放";
  const setPS=(sid,type,val)=>setPayStatus(prev=>({...prev,[`${sid}_${type}`]:val}));
  // 全域 isParttime helper（供所有 View 使用）
  const isParttimeGlobal=(consultantName)=>{
    const m=consultantDB.find(c=>c.name===consultantName);
    return m?.employmentType==="parttime";
  };
  const [currentUser,setCurrentUser] = useState("管理者");

  // ── 分潤 Level 設定 ──────────────────────────────────
  // 兼職行政費設定（可修改金額與生效日）
  const [adminFeeSettings,setAdminFeeSettings] = useState([
    {id:"basic",label:"基礎協助（代送/寄）",amount:500,
      desc:"簽證代送簽、領件及掛號寄回學生。郵寄費需由顧問獎金扣除。",
      effectiveDate:"2026-01-01"},
    {id:"full",label:"全包行政服務",amount:1000,
      desc:"簽證表格填寫、代送簽/領件、eTravel 填寫指導、機票代訂協助、行李須知提供。",
      effectiveDate:"2026-01-01"},
  ]);
  // 取得特定日期的行政費金額
  const getAdminFee=(type,dateStr)=>{
    const item=adminFeeSettings.find(x=>x.id===type);
    if(!item) return type==="basic"?500:1000;
    return item.amount;
  };

  const [bonusLevels,setBonusLevels] = useState([
    {id:1,label:"Level 1",minUSD:0,maxUSD:3200,pct:8,effectiveDate:"2026-01-01"},
    {id:2,label:"Level 2",minUSD:3201,maxUSD:6500,pct:12,effectiveDate:"2026-01-01"},
    {id:3,label:"Level 3",minUSD:6501,maxUSD:13000,pct:15,effectiveDate:"2026-01-01"},
    {id:4,label:"Level 4",minUSD:13001,maxUSD:null,pct:15,effectiveDate:"2026-01-01"},
  ]);

  // ── 帳號資料（模擬，不可用於正式環境）─────────────────
  const [accounts,setAccounts] = useState([
    {email:"zillionstars0523@gmail.com",role:"manager",name:"管理者"},
  ]);

  // 依帳號的分潤 level 計算（套用到業績頁）
  const getLevelByUSDWithDate=(usd,dateStr)=>{
    const d=dateStr||new Date().toISOString().split("T")[0];
    const applicable=bonusLevels.filter(l=>l.effectiveDate<=d).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate));
    const levels=applicable.length>0?applicable:bonusLevels;
    if(usd<=levels[0].maxUSD) return {level:levels[0].label,pct:levels[0].pct};
    if(usd<=levels[1].maxUSD) return {level:levels[1].label,pct:levels[1].pct};
    if(usd<=levels[2].maxUSD) return {level:levels[2].label,pct:levels[2].pct};
    return {level:levels[3].label,pct:levels[3].pct};
  };
  const [schoolDB,setSchoolDB]     = useState([]);
  const [consultantDB,setConsultantDB] = useState([
    {id:0,name:"管理者",role:"manager",email:"zillionstars0523@gmail.com",phone:"",emergencyName:"",emergencyPhone:"",address:"",note:"",startDate:"",endDate:"",status:"正職",probationTarget:5,probationEnd:"",employmentType:"fulltime"},
  ]);
  const [notifications,setNotifications] = useState([]); // 系統通知
  const [selId,setSelId]           = useState(null);
  const [detailTab,setDetailTab]   = useState("consult");
  const [filterPhase,setFilterPhase]   = useState("全部");
  const [filterRole,setFilterRole]     = useState("全部");
  const [filterStatus,setFilterStatus] = useState("全部");
  const [showAddModal,setShowAddModal] = useState(null);
  const [editStudentId,setEditStudentId]     = useState(null);
  const [editEnrolledId,setEditEnrolledId]   = useState(null);
  const [upgradeStudentId,setUpgradeStudentId] = useState(null);
  const [editCell,setEditCell]     = useState(null);
  const [editVal,setEditVal]       = useState("");
  const [dropdownPos,setDropdownPos] = useState({top:0,left:0});
  const [editingNote,setEditingNote] = useState(false);
  const [noteVal,setNoteVal]       = useState("");
  const [archiveTab,setArchiveTab] = useState("notEnroll");

  const sel = useMemo(()=>students.find(s=>s.id===selId)||null,[students,selId]);
  const consultStudents  = useMemo(()=>students.filter(s=>s.type==="consult"),[students]);
  const enrolledStudents = useMemo(()=>students.filter(s=>s.type==="enrolled"),[students]);
  const closedStudents   = useMemo(()=>students.filter(s=>s.type==="closed"),[students]);

  // 角色過濾：顧問只看自己負責的學生，管理者/行政看全部
  const visibleStudents = useMemo(()=>{
    if(currentRole==="consultant") return students.filter(s=>s.consultant===currentUser);
    return students; // manager / admin 看全部
  },[students,currentRole,currentUser]);
  const visibleConsult   = useMemo(()=>visibleStudents.filter(s=>s.type==="consult"),[visibleStudents]);
  const visibleEnrolled  = useMemo(()=>visibleStudents.filter(s=>s.type==="enrolled"),[visibleStudents]);
  const visibleClosed    = useMemo(()=>visibleStudents.filter(s=>s.type==="closed"),[visibleStudents]);
  const visibleNotEnroll = useMemo(()=>visibleClosed.filter(s=>["notEnroll","noContact","cancelEnroll"].includes(s.closeType)),[visibleClosed]);
  const visibleReturned  = useMemo(()=>visibleClosed.filter(s=>s.closeType==="returned"),[visibleClosed]);
  const notEnrollClosed  = useMemo(()=>closedStudents.filter(s=>["notEnroll","noContact","cancelEnroll"].includes(s.closeType)),[closedStudents]);
  const returnedClosed   = useMemo(()=>closedStudents.filter(s=>s.closeType==="returned"),[closedStudents]);

  function consultPct(s){
    const done=CONSULT_ITEMS.filter(t=>s.consultTasks[t.id]?.status==="已完成").length;
    return Math.round(done/CONSULT_ITEMS.length*100);
  }
  function enrollPct(s){
    if(!s.enrollTasks||!Object.keys(s.enrollTasks).length) return 0;
    const done=ENROLL_ITEMS.filter(t=>s.enrollTasks[t.id]?.status==="已完成").length;
    return Math.round(done/ENROLL_ITEMS.length*100);
  }
  function getCurrentEnrollPhase(s){
    for(const ph of ENROLL_PHASE_ORDER){
      const items=ENROLL_ITEMS.filter(t=>t.phase===ph);
      if(!items.every(t=>s.enrollTasks[t.id]?.status==="已完成")) return ph;
    }
    return "就讀中";
  }

  function updateTask(studentId,taskId,field,value,taskList){
    const now=new Date().toLocaleDateString("zh-TW");
    setStudents(prev=>prev.map(s=>{
      if(s.id!==studentId) return s;
      const key=taskList==="consult"?"consultTasks":"enrollTasks";
      const updated={...s,[key]:{...s[key],[taskId]:{...s[key][taskId],[field]:value,updatedAt:now}}};
      if(taskList==="consult"&&field==="status"&&taskId===4&&value==="不報名結案")
        return {...updated,type:"closed",closeType:"notEnroll"};
      if(taskList==="consult"&&field==="status"&&taskId===4&&value!=="不報名結案"&&s.closeType==="notEnroll")
        return {...updated,type:"consult",closeType:null};
      if(taskList==="enroll"&&field==="status"&&taskId===26&&value==="已回國結案")
        return {...updated,type:"closed",closeType:"returned"};
      if(taskList==="enroll"&&field==="status"&&taskId===26&&value!=="已回國結案"&&s.closeType==="returned")
        return {...updated,type:"enrolled",closeType:null};
      return updated;
    }));
    // 存到 Firestore
    const updatedStudent=students.find(x=>x.id===studentId);
    if(updatedStudent){
      const key2=taskList==="consult"?"consultTasks":"enrollTasks";
      const now2=new Date().toLocaleDateString("zh-TW");
      saveStudentToDB({...updatedStudent,[key2]:{...updatedStudent[key2],[taskId]:{...updatedStudent[key2][taskId],[field]:value,updatedAt:now2}}});
    }
  }

  function cycleStatus(studentId,taskId,taskList){
    const s=students.find(x=>x.id===studentId);
    const key=taskList==="consult"?"consultTasks":"enrollTasks";
    const cur=(s?.[key]?.[taskId]?.status)||"尚未進行";
    const next=ALL_STATUSES[(ALL_STATUSES.indexOf(cur)+1)%ALL_STATUSES.length];
    updateTask(studentId,taskId,"status",next,taskList);
  }

  // ── 依報名日與出發日間距計算各任務預設截止日 ────────────────────
  function calcEnrollDueDates(enrollDate, departDate, returnDate){
    const add=(base,days)=>{
      if(!base)return"";
      const d=new Date(base);d.setDate(d.getDate()+days);
      return d.toISOString().split("T")[0];
    };
    const sub=(base,days)=>add(base,-days);
    const diff=(!enrollDate||!departDate)?999
      :Math.round((new Date(departDate)-new Date(enrollDate))/(1000*60*60*24));

    let s={};
    if(diff<15){
      // 少於14天
      s[27]=add(enrollDate,1); s[10]=add(enrollDate,1);
      s[8] =add(enrollDate,3);
      s[11]=add(enrollDate,4); s[12]=add(enrollDate,4); s[9]=add(enrollDate,4);
      s[13]=add(enrollDate,5);
      s[28]=add(enrollDate,7); s[16]=add(enrollDate,7);
      s[14]=sub(departDate,6); s[15]=sub(departDate,6);
      s[17]=sub(departDate,6); s[29]=sub(departDate,6);
      s[22]=sub(departDate,5);
      s[21]=sub(departDate,4);
      s[18]=sub(departDate,4); s[19]=sub(departDate,4);
      s[23]=sub(departDate,1);
    } else if(diff<=30){
      // 15～30天
      s[27]=add(enrollDate,1); s[10]=add(enrollDate,1);
      s[8] =add(enrollDate,3);
      s[11]=add(enrollDate,7); s[12]=add(enrollDate,7); s[9]=add(enrollDate,7);
      s[13]=add(enrollDate,10);
      s[28]=add(enrollDate,14); s[16]=add(enrollDate,14);
      s[14]=sub(departDate,10); s[15]=sub(departDate,10);
      s[17]=sub(departDate,10); s[29]=sub(departDate,10);
      s[22]=sub(departDate,7);
      s[21]=sub(departDate,4);
      s[18]=sub(departDate,4); s[19]=sub(departDate,4);
      s[23]=sub(departDate,1);
    } else {
      // 大於30天
      s[27]=add(enrollDate,1); s[10]=add(enrollDate,1);
      s[8] =add(enrollDate,3);
      s[11]=add(enrollDate,10); s[12]=add(enrollDate,10); s[9]=add(enrollDate,10);
      s[13]=sub(departDate,30);
      s[28]=sub(departDate,35); s[16]=sub(departDate,35);
      s[14]=sub(departDate,14); s[15]=sub(departDate,14);
      s[17]=sub(departDate,10); s[29]=sub(departDate,10);
      s[22]=sub(departDate,14);
      s[21]=sub(departDate,4);
      s[18]=sub(departDate,7); s[19]=sub(departDate,7);
      s[23]=sub(departDate,1);
    }
    // 共同：確定報名三項 +1天，出發日當天，回程相關
    s[5]=add(enrollDate,1); s[6]=add(enrollDate,1); s[7]=add(enrollDate,1);
    s[20]=s[18]; // 提醒役男申請 = 同提醒換匯
    s[24]=departDate||"";   // 出發日當天
    s[25]=sub(returnDate,7); // 回程前7天
    s[26]=returnDate||"";    // 回程當天
    return s;
  }

  function confirmUpgrade(student,formData){
    const now=new Date().toLocaleDateString("zh-TW");
    const ed=formData.enrollDate||"";
    const dd=formData.departDate||"";
    const rd=formData.returnDate||"";
    const dueDates=calcEnrollDueDates(ed,dd,rd);
    setStudents(prev=>prev.map(s=>{
      if(s.id!==student.id) return s;
      const newConsult={...s.consultTasks,4:{...s.consultTasks[4],status:"確定報名",updatedAt:now}};
      const enrollTasks=Object.fromEntries(ENROLL_ITEMS.map(t=>[t.id,{
        status:"尚未進行",note:t.defaultNote||"",
        dueDate:dueDates[t.id]||"",updatedAt:""}]));
      return {...s,...formData,type:"enrolled",consultTasks:newConsult,enrollTasks};
    }));
    setUpgradeStudentId(null);
    setView("enrolled");
    // 存到 Firestore
    const updatedS2=students.find(x=>x.id===student.id);
    if(updatedS2) setTimeout(()=>{
      const latest=students.find(x=>x.id===student.id);
      if(latest) saveStudentToDB(latest);
    },100);
  }

  function confirmClose(student,formData,closeType){
    const now=new Date().toLocaleDateString("zh-TW");
    setStudents(prev=>prev.map(s=>{
      if(s.id!==student.id) return s;
      const newConsult={...s.consultTasks,4:{...s.consultTasks[4],status:"不報名結案",updatedAt:now}};
      // closeNote 存入 sharedNote（若已有則附加）
      const existNote=s.sharedNote||"";
      const closeNote=formData.closeNote||"";
      const mergedNote=closeNote
        ?(existNote?existNote+"\n\n【結案備註】"+closeNote:"【結案備註】"+closeNote)
        :existNote;
      return {...s,...formData,type:"closed",closeType,sharedNote:mergedNote,consultTasks:newConsult};
    }));
    setUpgradeStudentId(null);
    setView("archive");
  }

  function addDays(dateStr,days){
    if(!dateStr) return "";
    const d=new Date(dateStr);
    d.setDate(d.getDate()+days);
    return d.toISOString().split("T")[0];
  }

  function confirmAdd(formData,mode){
    const isEnroll=mode==="enrolled";
    const cd=formData.consultDate||new Date().toISOString().split("T")[0];
    const s={...formData,id:Date.now(),type:mode,closeType:null,
      createdAt:new Date().toISOString().split("T")[0],
      consultDate:cd,
      departDate:!isEnroll?(formData.consultDepartDate||""):formData.departDate,
      weeks:!isEnroll?(formData.consultWeeks||""):formData.weeks,
      returnDate:!isEnroll?(formData.consultReturnDate||""):formData.returnDate,
      consultTasks:Object.fromEntries(CONSULT_ITEMS.map(t=>[t.id,{
        status:"尚未進行",note:"",
        dueDate:t.id<=3?addDays(cd,3):t.id===4?addDays(cd,7):"",
        updatedAt:""}])),
      enrollTasks:isEnroll
        ?(()=>{
          const ed2=formData.enrollDate||"";
          const dd2=formData.departDate||"";
          const rd2=formData.returnDate||"";
          const dd2map=calcEnrollDueDates(ed2,dd2,rd2);
          return Object.fromEntries(ENROLL_ITEMS.map(t=>[t.id,{
            status:"尚未進行",note:t.defaultNote||"",
            dueDate:dd2map[t.id]||"",updatedAt:""}]));
        })()
        :{},
    };
    setStudents(prev=>[s,...prev]);
    saveStudentToDB(s);
    setShowAddModal(null);
  }

  function confirmEdit(formData){
    const schoolListStr=(formData.schoolOptions||[])
      .filter(s=>s.school.trim())
      .map(s=>[s.school,s.program,s.room,s.note].filter(Boolean).join(" / "))
      .join("\n");
    // 諮詢模式下，出發/回程/週數存在 consultDepartDate 等欄位，要同步到 departDate
    const merged={
      ...formData,
      schoolList:schoolListStr,
      departDate:formData.consultDepartDate||formData.departDate||"",
      returnDate:formData.consultReturnDate||formData.returnDate||"",
      weeks:formData.consultWeeks||formData.weeks||"",
      // chosenSchool 對應的學校詳細資訊
      school:formData.consultChosenSchool||formData.chosenSchool||formData.school||"",
      program:formData.consultChosenProgram||formData.program||"",
      room:formData.consultChosenRoom||formData.room||"",
    };
    const editId2=editStudentId;
    setStudents(prev=>prev.map(s=>s.id===editId2?{...s,...merged}:s));
    setEditStudentId(null);
    // 存到 Firestore
    const orig=students.find(s=>s.id===editId2);
    if(orig) saveStudentToDB({...orig,...merged});
  }

  function confirmEditEnrolled(formData){
    // 重新計算所有任務預設日期（只更新還沒設定或還是預設的，讓已手動修改的保留）
    const newDues=calcEnrollDueDates(formData.enrollDate||"",formData.departDate||"",formData.returnDate||"");
    setStudents(prev=>prev.map(s=>{
      if(s.id!==editEnrolledId) return s;
      // 重算 enrollTasks dueDate（保留已完成或已手動修改的任務日期不動）
      const updatedTasks=Object.fromEntries(
        Object.entries(s.enrollTasks).map(([tid,task])=>{
          const id=Number(tid);
          // 已完成的任務不更新日期
          if(task.status==="已完成") return [tid,task];
          return [tid,{...task,dueDate:newDues[id]||task.dueDate}];
        })
      );
      return {...s,...formData,enrollTasks:updatedTasks};
    }));
    setEditEnrolledId(null);
    // 存到 Firestore
    setTimeout(()=>{
      const latest2=students.find(s=>s.id===editEnrolledId);
      if(latest2) saveStudentToDB(latest2);
    },100);
  }

  function confirmCancelEnrolled(formData){
    const today=new Date();
    const cancelDate=formData.cancelDate||today.toISOString().split("T")[0];
    // 判斷是否已支付前期獎金（出發日前4週是否已過）
    const p4wDate=formData.departDate?(()=>{
      const d=new Date(formData.departDate);
      d.setDate(d.getDate()-28);
      return d.toISOString().split("T")[0];
    })():null;
    const phase1Paid=p4wDate&&p4wDate<=cancelDate;
    // 次月10日（需扣回）
    const nextM10=(()=>{
      const d=new Date(cancelDate);
      const nm=d.getMonth()+2>12?1:d.getMonth()+2;
      const ny=d.getMonth()+2>12?d.getFullYear()+1:d.getFullYear();
      return `${ny}-${String(nm).padStart(2,"0")}-10`;
    })();
    const commTWD=Math.round(Number(formData.commission||0)*31);
    const phase1TWD=Math.round((commTWD*0.08-1000)*0.5); // 近似計算，僅用於備註
    const cancelNote=formData.cancelNote||"";
    const phase2TWD=commTWD-Math.round(commTWD*0.5); // 後期獎金取消
    const clawbackNote=phase1Paid
      ?`【取消報名結案｜${cancelDate}】前期獎金已發放（NT$${phase1TWD.toLocaleString()}），將於${nextM10}薪資中扣回。後期獎金（NT$${phase2TWD.toLocaleString()}）取消，不予發放。${cancelNote?cancelNote:""}`
      :`【取消報名結案｜${cancelDate}】前期獎金尚未發放，無需扣回。後期獎金（NT$${phase2TWD.toLocaleString()}）取消，不予發放。${cancelNote?cancelNote:""}`;
    const sid=editEnrolledId;
    setStudents(prev=>prev.map(s=>{
      if(s.id!==sid) return s;
      return {...s,...formData,type:"closed",closeType:"cancelEnroll",
        cancelDate,phase1Paid,
        clawbackDate:phase1Paid?nextM10:"",
        clawbackTWD:phase1Paid?phase1TWD:0,
        phase2Cancelled:true,
        phase2TWD,
        sharedNote:(s.sharedNote?s.sharedNote+"\n\n":"")+clawbackNote};
    }));
    // 自動更新發放狀態（無論是否已出發，取消就更新）
    const incentiveSt=getPayStatus(sid,"incentive");
    if(incentiveSt==="待發放") setPS(sid,"incentive","取消");
    // 前期獎金：已發放→待扣回；待發放→取消
    const p1St=getPayStatus(sid,"phase1");
    if(p1St==="已發放") setPS(sid,"phase1","待扣回");
    else if(p1St==="待發放") setPS(sid,"phase1","取消");
    // 後期獎金：已發放→待扣回；待發放→取消
    const p2St=getPayStatus(sid,"phase2");
    if(p2St==="已發放") setPS(sid,"phase2","待扣回");
    else if(p2St==="待發放") setPS(sid,"phase2","取消");
    // 介紹獎金同樣處理
    const refSt=getPayStatus(sid,"referral");
    if(refSt==="待發放") setPS(sid,"referral","取消");
    setEditEnrolledId(null);
    setView("archive");
  }

  function saveSharedNote(id,note){
    setStudents(prev=>prev.map(s=>s.id===id?{...s,sharedNote:note}:s));
    setEditingNote(false);
    const orig2=students.find(s=>s.id===id);
    if(orig2) saveStudentToDB({...orig2,sharedNote:note});
  }

  const inp=(ex={})=>({border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",
    fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",
    width:"100%",boxSizing:"border-box",color:"#0f172a",...ex});
  const btnS=(bg="#6366f1",fg="#fff",ex={})=>({background:bg,color:fg,border:"none",
    borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",...ex});

  // ── 任務表格 ──────────────────────────────────────────────────
  const TaskTable=({student,items,phaseOrder,taskList})=>{
    const tasks=taskList==="consult"?student.consultTasks:student.enrollTasks;
    const filtered=items.filter(t=>
      (filterPhase==="全部"||t.phase===filterPhase)&&
      (filterRole==="全部"||t.role===filterRole)&&
      (filterStatus==="全部"||tasks[t.id]?.status===filterStatus)
    );
    const grouped=phaseOrder
      .filter(ph=>filterPhase==="全部"||ph===filterPhase)
      .map(ph=>({phase:ph,items:filtered.filter(t=>t.phase===ph)}))
      .filter(g=>g.items.length>0);
    if(grouped.length===0)
      return <div style={{textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>✨ 沒有符合篩選條件的項目</div>;
    return (
      <>
        {grouped.map(({phase,items:gItems})=>{
          const cfg=PHASE_CONFIG[phase];
          const phaseDone=gItems.filter(t=>tasks[t.id]?.status==="已完成").length;
          return (
            <div key={phase} style={{marginBottom:14}}>
              <div style={{background:cfg.bg,border:`2px solid ${cfg.color}30`,
                borderRadius:"12px 12px 0 0",padding:"9px 18px",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:16}}>{cfg.icon}</span>
                <span style={{fontWeight:800,color:cfg.color,fontSize:14}}>{phase}</span>
                <span style={{fontSize:11,color:cfg.color,opacity:0.8,marginLeft:"auto"}}>{phaseDone}/{gItems.length} 完成</span>
              </div>
              <div style={{background:"#fff",border:`1.5px solid ${cfg.color}20`,
                borderTop:"none",borderRadius:"0 0 12px 12px"}}>
                <div style={{display:"grid",gridTemplateColumns:"40px minmax(160px,1fr) 76px 148px 128px 1fr",
                  background:"#f8fafc",padding:"7px 14px",borderBottom:"1px solid #e2e8f0",
                  fontSize:11,color:"#64748b",fontWeight:700,gap:8}}>
                  <span>✓</span><span>工作項目</span><span>負責</span>
                  <span>進度狀態</span><span>預計完成日期</span><span>備註</span>
                </div>
                {gItems.map((t,idx)=>{
                  const ts=tasks[t.id]||{};
                  const isDone=ts.status==="已完成";
                  const isClosed=["不報名結案","已回國結案","確定報名"].includes(ts.status);
                  const isEditNote=editCell?.sid===student.id&&editCell?.tid===t.id&&editCell?.field==="note"&&editCell?.list===taskList;
                  const isEditDate=editCell?.sid===student.id&&editCell?.tid===t.id&&editCell?.field==="dueDate"&&editCell?.list===taskList;
                  const isDecisionNode=t.isDecision||t.isReturnPoint;
                  const rowBg=isDone?"#f0fdf4":ts.status==="確定報名"?"#ecfdf5":ts.status==="不報名結案"?"#fef2f2":ts.status==="已回國結案"?"#e0f2fe":"transparent";
                  const isLast=idx===gItems.length-1;
                  return (
                    <div key={t.id} style={{display:"grid",gridTemplateColumns:"40px minmax(160px,1fr) 76px 148px 128px 1fr",
                      padding:"11px 14px",gap:8,alignItems:"center",position:"relative",
                      borderBottom:isLast?"none":"1px solid #f1f5f9",
                      borderRadius:isLast?"0 0 12px 12px":0,
                      background:rowBg,transition:"background 0.15s"}}
                      onMouseEnter={e=>{if(!isDone&&!isClosed)e.currentTarget.style.background="#fafbff";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                      {/* Checkbox */}
                      <div style={{display:"flex",justifyContent:"center"}}>
                        <button onClick={()=>{
                          if(isClosed) return;
                          updateTask(student.id,t.id,"status",isDone?"尚未進行":"已完成",taskList);
                        }} style={{width:22,height:22,borderRadius:6,border:"2px solid",
                          borderColor:isDone?"#10b981":isClosed?"#a3a3a3":"#cbd5e1",
                          background:isDone?"#10b981":isClosed?"#f1f5f9":"#fff",
                          cursor:isClosed?"default":"pointer",display:"flex",
                          alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {isDone&&<span style={{color:"#fff",fontSize:12,fontWeight:900,lineHeight:1}}>✓</span>}
                        </button>
                      </div>
                      {/* Task name */}
                      <div style={{fontSize:13,fontWeight:600,lineHeight:1.5,
                        color:isClosed?"#94a3b8":isDone?"#94a3b8":"#0f172a",
                        textDecoration:isDone?"line-through":"none",wordBreak:"keep-all"}}>
                        {t.task}
                        {t.isDecision&&student.type==="consult"&&(
                          <button onClick={e=>{e.stopPropagation();setUpgradeStudentId(student.id);}}
                            style={{marginLeft:10,background:"#059669",color:"#fff",border:"none",
                              borderRadius:6,padding:"2px 10px",fontSize:11,fontWeight:700,
                              cursor:"pointer",fontFamily:"inherit"}}>
                            🎉 確定報名 →
                          </button>
                        )}
                        {isDecisionNode&&(
                          <span style={{fontSize:10,background:"#f1f5f9",color:"#64748b",
                            borderRadius:99,padding:"1px 7px",marginLeft:8,fontWeight:600}}>
                            {t.isDecision?"關鍵節點":"結案節點"}
                          </span>
                        )}
                      </div>
                      {/* Role */}
                      <div>
                        {student.consultant
                          ? <span style={{background:"#eef2ff",color:"#6366f1",border:"1px solid #c7d2fe",borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{student.consultant}</span>
                          : <RoleTag role={t.role}/>
                        }
                      </div>
                      {/* Status */}
                      <div>
                        {isDecisionNode?(
                          <button onClick={e=>{
                            e.stopPropagation();
                            if(editCell?.sid===student.id&&editCell?.tid===t.id&&editCell?.field==="status"){setEditCell(null);return;}
                            const rect=e.currentTarget.getBoundingClientRect();
                            setDropdownPos({top:rect.bottom+4,left:rect.left});
                            setEditCell({sid:student.id,tid:t.id,field:"status",list:taskList});
                          }} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                            <StatusBadge status={ts.status||"尚未進行"}/>
                          </button>
                        ):(
                          <button onClick={()=>cycleStatus(student.id,t.id,taskList)}
                            style={{background:"transparent",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                            <StatusBadge status={ts.status||"尚未進行"}/>
                          </button>
                        )}
                      </div>
                      {/* Due date */}
                      <div>
                        {isEditDate?(
                          <input type="date" autoFocus value={editVal}
                            onChange={e=>setEditVal(e.target.value)}
                            onBlur={()=>{updateTask(student.id,t.id,"dueDate",editVal,taskList);setEditCell(null);}}
                            style={{...inp(),padding:"4px 8px",fontSize:12,width:"120px"}}/>
                        ):(
                          <button onClick={()=>{setEditCell({sid:student.id,tid:t.id,field:"dueDate",list:taskList});setEditVal(ts.dueDate||"");}}
                            style={{background:"transparent",border:"1px dashed #e2e8f0",borderRadius:6,
                              padding:"4px 10px",fontSize:12,cursor:"pointer",
                              color:ts.dueDate?"#0f172a":"#94a3b8",fontFamily:"inherit",minWidth:100,textAlign:"left"}}>
                            {ts.dueDate||"點擊設定..."}
                          </button>
                        )}
                      </div>
                      {/* Note */}
                      <div>
                        {isEditNote?(
                          <textarea autoFocus value={editVal}
                            onChange={e=>setEditVal(e.target.value)}
                            onBlur={()=>{updateTask(student.id,t.id,"note",editVal,taskList);setEditCell(null);}}
                            style={{...inp(),padding:"4px 8px",fontSize:12,resize:"vertical",minHeight:36,lineHeight:1.5}}/>
                        ):(
                          <button onClick={()=>{setEditCell({sid:student.id,tid:t.id,field:"note",list:taskList});setEditVal(ts.note||"");}}
                            style={{background:"transparent",border:"1px dashed #e2e8f0",borderRadius:6,
                              padding:"4px 10px",fontSize:12,cursor:"pointer",
                              color:ts.note?"#374151":"#94a3b8",fontFamily:"inherit",
                              width:"100%",textAlign:"left",whiteSpace:"pre-wrap",wordBreak:"break-all",
                              lineHeight:1.5,display:"block"}}>
                            {ts.note||"點擊新增備註..."}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  // ── 詳細頁 ────────────────────────────────────────────────────
  const DetailView=()=>{
    if(!sel) return null;
    const isEnrolledOrClosed=sel.type==="enrolled"||sel.type==="closed";
    const isClosed=sel.type==="closed";
    const pct=isEnrolledOrClosed?enrollPct(sel):consultPct(sel);
    const phaseColor=isEnrolledOrClosed?PHASE_CONFIG[getCurrentEnrollPhase(sel)].color:"#6366f1";
    const effectiveTab=!isEnrolledOrClosed?"consult":detailTab;

    return (
      <div>
        <button onClick={()=>setView(isClosed?"archive":sel.type==="enrolled"?"enrolled":"consult")}
          style={{...btnS("#f1f5f9","#475569"),marginBottom:20,padding:"7px 16px",fontSize:13}}>
          ← 返回
        </button>

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%)",
          borderRadius:16,padding:"22px 26px",marginBottom:14,color:"#fff",
          boxShadow:"0 8px 32px rgba(99,102,241,0.22)"}}>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
            <Avatar name={sel.name} size={52}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:22,fontWeight:900}}>{sel.name}</span>
                <span style={{fontSize:12,fontWeight:700,borderRadius:99,padding:"3px 12px",
                  background:sel.type==="consult"?"rgba(99,102,241,0.35)":sel.type==="enrolled"?"rgba(5,150,105,0.35)":"rgba(239,68,68,0.35)"}}>
                  {sel.type==="consult"?"🔍 諮詢中":sel.type==="enrolled"?"📝 正式報名":sel.closeType==="notEnroll"?"🚫 不報名結案":sel.closeType==="noContact"?"📵 聯繫不上結案":sel.closeType==="cancelEnroll"?"🚫 取消報名結案":"✅ 已回國結案"}
                </span>
              </div>
              <div style={{fontSize:12,opacity:0.75,marginTop:4}}>
                {[sel.school,sel.program,sel.room].filter(Boolean).join("　")}
              </div>
              <div style={{display:"flex",gap:12,fontSize:12,opacity:0.7,marginTop:4,flexWrap:"wrap"}}>
                {sel.enrollDate&&<span style={{background:"rgba(255,255,255,0.15)",borderRadius:99,padding:"1px 8px"}}>📝 報名 {sel.enrollDate}</span>}
                {sel.departDate&&<span>✈️ {sel.departDate}</span>}
                {sel.returnDate&&<span>🏠 {sel.returnDate}</span>}
                {sel.consultant&&<span>👤 {sel.consultant}</span>}

                {sel.commission&&<span style={{background:"rgba(251,191,36,0.25)",borderRadius:99,padding:"1px 8px"}}>💰 佣金 USD${Number(sel.commission).toLocaleString()}</span>}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
              {sel.type==="consult"&&(
                <button onClick={()=>setEditStudentId(sel.id)}
                  style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",
                    borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
                    fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  ✏️ 編輯諮詢資料
                </button>
              )}
              {sel.type==="enrolled"&&(
                <button onClick={()=>setEditEnrolledId(sel.id)}
                  style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",
                    borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
                    fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  ✏️ 編輯報名資料
                </button>
              )}
              <ProgressRing pct={pct} size={62} color="#a5f3fc"/>
            </div>
          </div>
          {isEnrolledOrClosed&&(
            <div style={{display:"flex",gap:4,marginTop:4}}>
              {ENROLL_PHASE_ORDER.map(ph=>{
                const items=ENROLL_ITEMS.filter(t=>t.phase===ph);
                const cnt=items.filter(t=>sel.enrollTasks[t.id]?.status==="已完成").length;
                const pp=Math.round(cnt/items.length*100);
                return (
                  <div key={ph} style={{flex:1}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:2}}>{ph}</div>
                    <div style={{background:"rgba(255,255,255,0.2)",borderRadius:99,height:5}}>
                      <div style={{width:`${pp}%`,height:"100%",background:"#a5f3fc",borderRadius:99,minWidth:pp>0?3:0}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 共用備註 */}
        <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:12,border:"1.5px solid #fde68a"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span>📝</span>
              <span style={{fontWeight:800,color:"#92400e",fontSize:14}}>共用備註</span>
              <span style={{fontSize:11,color:"#a16207",background:"#fef9c3",
                border:"1px solid #fde68a",borderRadius:99,padding:"1px 8px",fontWeight:600}}>顧問＆行政共享</span>
            </div>
            {!editingNote&&(
              <button onClick={()=>{setEditingNote(true);setNoteVal(sel.sharedNote||"");}}
                style={{...btnS("#fef9c3","#92400e"),padding:"5px 14px",fontSize:12,border:"1px solid #fde68a"}}>
                {sel.sharedNote?"✏️ 編輯":"＋ 新增"}
              </button>
            )}
          </div>
          {editingNote?(
            <div style={{marginTop:10}}>
              <textarea value={noteVal} onChange={e=>setNoteVal(e.target.value)}
                style={{...inp(),height:80,resize:"vertical",lineHeight:1.6,border:"1.5px solid #fde68a",background:"#fffbeb"}}/>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>saveSharedNote(sel.id,noteVal)} style={btnS("#f59e0b")}>儲存</button>
                <button onClick={()=>setEditingNote(false)} style={btnS("#f1f5f9","#475569")}>取消</button>
              </div>
            </div>
          ):(
            sel.sharedNote
              ?<div style={{fontSize:13,color:"#78350f",lineHeight:1.7,marginTop:8,background:"#fffbeb",borderRadius:8,padding:"10px 14px"}}>{sel.sharedNote}</div>
              :<div style={{fontSize:13,color:"#d97706",marginTop:6,fontStyle:"italic"}}>尚無共用備註</div>
          )}
        </div>

        {/* Tabs */}
        {isEnrolledOrClosed&&(
          <div style={{display:"flex",gap:0,marginBottom:12,background:"#f1f5f9",borderRadius:10,padding:4,width:"fit-content"}}>
            {[["consult","🔍 諮詢紀錄"],["enroll","📋 報名追蹤"]].map(([tab,label])=>(
              <button key={tab} onClick={()=>setDetailTab(tab)} style={{
                ...btnS(effectiveTab===tab?"#fff":"transparent",effectiveTab===tab?"#0f172a":"#64748b"),
                padding:"7px 18px",fontSize:13,
                boxShadow:effectiveTab===tab?"0 1px 4px rgba(0,0,0,0.1)":undefined,
                borderRadius:8,transition:"all 0.15s"}}>{label}</button>
            ))}
          </div>
        )}

        {/* 篩選 */}
        <div style={{background:"#fff",borderRadius:10,padding:"10px 14px",marginBottom:12,
          border:"1px solid #e2e8f0",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#64748b",fontWeight:700}}>階段</span>
          {["全部",...(effectiveTab==="enroll"?ENROLL_PHASE_ORDER:CONSULT_PHASE_ORDER)].map(ph=>(
            <button key={ph} onClick={()=>setFilterPhase(ph)} style={{
              ...btnS(filterPhase===ph?"#6366f1":"#f1f5f9",filterPhase===ph?"#fff":"#475569"),
              padding:"4px 10px",fontSize:11}}>
              {ph==="全部"?ph:(PHASE_CONFIG[ph]?.icon+" "+ph)}
            </button>
          ))}
          <div style={{width:1,height:18,background:"#e2e8f0",margin:"0 3px"}}/>
          {["全部","顧問","行政"].map(r=>(
            <button key={r} onClick={()=>setFilterRole(r)} style={{
              ...btnS(filterRole===r?"#0f172a":"#f1f5f9",filterRole===r?"#fff":"#475569"),
              padding:"4px 10px",fontSize:11}}>{r}</button>
          ))}
          <div style={{width:1,height:18,background:"#e2e8f0",margin:"0 3px"}}/>
          {["全部",...ALL_STATUSES].map(st=>(
            <button key={st} onClick={()=>setFilterStatus(st)} style={{
              ...btnS(filterStatus===st?"#0f172a":"#f1f5f9",filterStatus===st?"#fff":"#475569"),
              padding:"4px 10px",fontSize:11}}>{st}</button>
          ))}
        </div>

        {/* Task tables */}
        {(!isEnrolledOrClosed||effectiveTab==="consult")&&(
          <TaskTable student={sel} items={CONSULT_ITEMS} phaseOrder={CONSULT_PHASE_ORDER} taskList="consult"/>
        )}
        {isEnrolledOrClosed&&effectiveTab==="enroll"&&(
          <TaskTable student={sel} items={ENROLL_ITEMS} phaseOrder={ENROLL_PHASE_ORDER} taskList="enroll"/>
        )}

        {/* Fixed dropdown */}
        {editCell?.field==="status"&&sel&&(()=>{
          const item=[...CONSULT_ITEMS,...ENROLL_ITEMS].find(t=>t.id===editCell.tid);
          const tasks=editCell.list==="consult"?sel.consultTasks:sel.enrollTasks;
          const ts=tasks[editCell.tid]||{};
          const opts=item?.isDecision
            ?[...ALL_STATUSES,"不報名結案"]
            :item?.isReturnPoint
            ?[...ALL_STATUSES,"已回國結案"]
            :ALL_STATUSES;
          return (
            <div style={{position:"fixed",top:dropdownPos.top,left:dropdownPos.left,zIndex:9999,
              background:"#fff",borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",
              border:"1px solid #e2e8f0",minWidth:160,overflow:"hidden"}}
              onClick={e=>e.stopPropagation()}>
              {opts.map(st=>(
                <button key={st}
                  onClick={()=>{updateTask(sel.id,editCell.tid,"status",st,editCell.list);setEditCell(null);}}
                  style={{display:"flex",alignItems:"center",width:"100%",padding:"9px 14px",
                    border:"none",cursor:"pointer",fontSize:12,fontFamily:"inherit",
                    background:ts.status===st?"#f8fafc":"#fff",borderBottom:"1px solid #f1f5f9"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"}
                  onMouseLeave={e=>e.currentTarget.style.background=ts.status===st?"#f8fafc":"#fff"}>
                  <StatusBadge status={st}/>
                  {ts.status===st&&<span style={{marginLeft:"auto",color:"#10b981"}}>✓</span>}
                </button>
              ))}
            </div>
          );
        })()}
      </div>
    );
  };

  // ── 學生卡片共用 ────────────────────────────────────────────
  const StudentCard=({s,pct,phaseLabel,phaseColor,phaseBg,tags=[],onClick,onEdit})=>{
    const pColor=s.priority==="high"?"#ef4444":s.priority==="medium"?"#f59e0b":"#10b981";
    const pLabel=s.priority==="high"?"緊急":s.priority==="medium"?"一般":"低";
    return (
      <div style={{background:"#fff",borderRadius:16,padding:22,border:"1px solid #e2e8f0",
        cursor:"pointer",transition:"all 0.2s",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",position:"relative"}}
        onClick={onClick}
        onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(99,102,241,0.12)";e.currentTarget.style.borderColor="#c7d2fe";}}
        onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.04)";e.currentTarget.style.borderColor="#e2e8f0";}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Avatar name={s.name} size={44}/>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>{s.name}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.school||"—"}　{s.program||"—"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {onEdit&&<button onClick={e=>{e.stopPropagation();onEdit(s);}}
              style={{background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",borderRadius:7,
                padding:"5px 11px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                display:"flex",alignItems:"center",gap:4}}>
              ✏️ 編輯
            </button>}
            <ProgressRing pct={pct} size={50} color={phaseColor}/>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          <span style={{background:phaseBg,color:phaseColor,border:`1px solid ${phaseColor}30`,
            borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700}}>{phaseLabel}</span>
          <span style={{background:pColor+"18",color:pColor,border:`1px solid ${pColor}30`,
            borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700}}>{pLabel}</span>
          {tags}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11,marginBottom:s.sharedNote?10:0}}>
          {[["👤 顧問",s.consultant||"—"],
            ["✈️ 出發",s.departDate||"—"],["📅 建立",s.createdAt]].map(([l,v])=>(
            <div key={l}><span style={{color:"#94a3b8"}}>{l}　</span>
              <span style={{color:"#0f172a",fontWeight:600}}>{v}</span></div>
          ))}
        </div>
        {s.sharedNote&&(
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,
            padding:"6px 10px",fontSize:11,color:"#92400e"}}>
            📝 {s.sharedNote.length>55?s.sharedNote.slice(0,55)+"…":s.sharedNote}
          </div>
        )}
      </div>
    );
  };

  // ── 各列表頁 ─────────────────────────────────────────────────
  const ConsultView=()=>(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:14,color:"#64748b"}}>諮詢中　共 <strong>{visibleConsult.length}</strong> 位</div>
        <button onClick={()=>setShowAddModal("consult")} style={btnS("#6366f1")}>＋ 新增諮詢學生</button>
      </div>
      {/* 說明提示 */}
      <div style={{background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:10,
        padding:"10px 16px",marginBottom:16,fontSize:13,color:"#4338ca",display:"flex",gap:8}}>
        <span>💡</span>
        <span>諮詢中學生完成評估後，可在流程檢核頁點擊「🎉 確定報名 →」升級為正式報名；若不報名，將自動歸入結案清單。</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
        {visibleConsult.map(s=>(
          <StudentCard key={s.id} s={s} pct={consultPct(s)}
            phaseLabel="🔍 諮詢中" phaseColor="#6366f1" phaseBg="#eef2ff"
            tags={[<span key="t" style={{background:"#f1f5f9",color:"#64748b",borderRadius:99,
              padding:"3px 10px",fontSize:11,fontWeight:700}}>
              {CONSULT_ITEMS.filter(t=>s.consultTasks[t.id]?.status==="已完成").length}/{CONSULT_ITEMS.length} 完成
            </span>]}
            onClick={()=>{setSelId(s.id);setView("detail");}}
            onEdit={(s)=>setEditStudentId(s.id)}/>
        ))}
        {visibleConsult.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>
            目前沒有諮詢中的學生
          </div>
        )}
      </div>
    </div>
  );

  const EnrolledView=()=>(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:14,color:"#64748b"}}>正式報名　共 <strong>{visibleEnrolled.length}</strong> 位</div>
        <button onClick={()=>setShowAddModal("enrolled")} style={btnS("#059669")}>＋ 新增正式報名學生</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
        {visibleEnrolled.map(s=>{
          const ph=getCurrentEnrollPhase(s),cfg=PHASE_CONFIG[ph];
          const done=ENROLL_ITEMS.filter(t=>s.enrollTasks[t.id]?.status==="已完成").length;
          const inProg=ENROLL_ITEMS.filter(t=>s.enrollTasks[t.id]?.status==="進行中").length;
          return (
            <StudentCard key={s.id} s={s} pct={enrollPct(s)}
              phaseLabel={`${cfg.icon} ${ph}`} phaseColor={cfg.color} phaseBg={cfg.bg}
              tags={[
                <span key="done" style={{background:"#ecfdf5",color:"#10b981",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700}}>✅ {done}</span>,
                inProg>0&&<span key="prog" style={{background:"#fffbeb",color:"#f59e0b",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700}}>⚡ {inProg}</span>,
              ].filter(Boolean)}
              onClick={()=>{setSelId(s.id);setDetailTab("enroll");setView("detail");}}
              onEdit={(s)=>setEditEnrolledId(s.id)}/>
          );
        })}
        {visibleEnrolled.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>
            目前沒有正式報名的學生
          </div>
        )}
      </div>
    </div>
  );

  const TodoView=()=>{
    const [todoConsultant,setTodoConsultant]=React.useState("全部");
    const [todoPeriod,setTodoPeriod]=React.useState("7");

    const today=new Date(); today.setHours(0,0,0,0);
    const cutoff=new Date(today);
    if(todoPeriod==="2") cutoff.setDate(today.getDate()+2);
    else if(todoPeriod==="7") cutoff.setDate(today.getDate()+7);
    else if(todoPeriod==="14") cutoff.setDate(today.getDate()+14);
    else if(todoPeriod==="month"){
      cutoff.setFullYear(today.getFullYear(),today.getMonth()+1,0);// 當月最後一天
    } else cutoff.setDate(today.getDate()+31);

    // 取得所有顧問清單
    const consultants=["全部",...Array.from(new Set(visibleEnrolled.map(s=>s.consultant).filter(Boolean)))];

    // 收集所有待辦
    const todos=[];
    visibleEnrolled.forEach(s=>{
      if(currentRole!=="consultant"&&todoConsultant!=="全部"&&s.consultant!==todoConsultant) return;
      ENROLL_ITEMS.forEach(t=>{
        const ts=s.enrollTasks[t.id];
        if(!ts||ts.status==="已完成") return;
        if(!ts.dueDate) return;
        const due=new Date(ts.dueDate); due.setHours(0,0,0,0);
        if(due>cutoff) return;
        todos.push({student:s,task:t,ts,due,overdue:due<today});
      });
    });
    todos.sort((a,b)=>a.due-b.due);

    // 分組
    const in7d=new Date(today); in7d.setDate(today.getDate()+7);
    const in14d=new Date(today); in14d.setDate(today.getDate()+14);
    const groups=[
      {label:"🔴 逾期",color:"#ef4444",bg:"#fef2f2",border:"#fca5a5",items:todos.filter(x=>x.overdue)},
      {label:"⚡ 7 天內",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",items:todos.filter(x=>!x.overdue&&x.due<=in7d)},
      {label:"📅 2 週內",color:"#6366f1",bg:"#eef2ff",border:"#c7d2fe",items:todos.filter(x=>!x.overdue&&x.due>in7d&&x.due<=in14d)},
      {label:"📆 下個月內",color:"#0284c7",bg:"#e0f2fe",border:"#7dd3fc",items:todos.filter(x=>!x.overdue&&x.due>in14d)},
    ].filter(g=>g.items.length>0&&(
      (todoPeriod==="2"&&(g.label.includes("逾期")||g.label.includes("7")))||
      (todoPeriod==="7"&&(g.label.includes("逾期")||g.label.includes("7")))||
      (todoPeriod==="14"&&(g.label.includes("逾期")||g.label.includes("7")||g.label.includes("2")))||
      (todoPeriod==="month"&&true)||
      (todoPeriod==="31"&&true)
    ));

    return (
      <div>
        {/* 篩選列 */}
        <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {[["2","🔥 2天內"],["7","⚡ 1週內"],["14","📅 2週內"],["month","📅 當月"],["31","📆 下個月"]].map(([v,lb])=>(
              <button key={v} onClick={()=>setTodoPeriod(v)}
                style={{...btnS(todoPeriod===v?"#fff":"transparent",todoPeriod===v?"#0f172a":"#64748b"),
                  padding:"5px 14px",fontSize:12,boxShadow:todoPeriod===v?"0 1px 4px rgba(0,0,0,.1)":undefined,borderRadius:7}}>
                {lb}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {consultants.map(c=>(
              <button key={c} onClick={()=>setTodoConsultant(c)}
                style={{...btnS(todoConsultant===c?"#6366f1":"#f1f5f9",todoConsultant===c?"#fff":"#475569"),
                  padding:"5px 12px",fontSize:12}}>
                {c}
              </button>
            ))}
          </div>
          <div style={{marginLeft:"auto",fontSize:12,color:"#64748b"}}>
            共 <strong>{todos.length}</strong> 項待辦
          </div>
        </div>

        {todos.length===0
          ?<div style={{textAlign:"center",padding:60,color:"#94a3b8",fontSize:14}}>✨ 所選期間內沒有待辦事項</div>
          :<div style={{display:"flex",flexDirection:"column",gap:16}}>
            {groups.map(g=>{
              // 以學生為單位分組
              const studentMap=[];
              const seen={};
              g.items.forEach(item=>{
                if(!seen[item.student.id]){seen[item.student.id]=true;studentMap.push(item.student);}
              });
              return (
                <div key={g.label}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontWeight:800,fontSize:14,color:g.color}}>{g.label}</span>
                    <span style={{background:g.bg,color:g.color,border:`1px solid ${g.border}`,
                      borderRadius:99,padding:"1px 9px",fontSize:11,fontWeight:700}}>{g.items.length} 項</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {studentMap.map(s=>{
                      const sItems=g.items.filter(x=>x.student.id===s.id);
                      return (
                        <div key={s.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                          {/* 學生 header */}
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                            background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                            <Avatar name={s.name} size={30}/>
                            <div>
                              <button onClick={()=>{setSelId(s.id);setDetailTab("enroll");setView("detail");}}
                                style={{background:"transparent",border:"none",cursor:"pointer",padding:0,
                                  fontFamily:"inherit",fontWeight:800,fontSize:14,color:"#6366f1"}}>
                                {s.name}
                              </button>
                              <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{s.consultant||"—"}</span>
                            </div>
                            <span style={{marginLeft:"auto",fontSize:11,color:g.color,fontWeight:700,
                              background:g.bg,border:`1px solid ${g.border}`,borderRadius:99,padding:"1px 8px"}}>
                              {sItems.length} 項待辦
                            </span>
                          </div>
                          {/* 表頭 */}
                          <div style={{display:"grid",gridTemplateColumns:"minmax(180px,2fr) 110px 110px 1fr",
                            background:"#fafbff",padding:"6px 16px",borderBottom:"1px solid #f1f5f9",
                            fontSize:11,color:"#94a3b8",fontWeight:700,gap:8}}>
                            <span>工作事項</span><span>進度狀態</span><span>預計完成</span><span>備註</span>
                          </div>
                          {/* 任務列 */}
                          {sItems.map((item,idx)=>{
                            const {task:t,ts}=item;
                            const isEditNote=editCell?.sid===s.id&&editCell?.tid===t.id&&editCell?.field==="note"&&editCell?.list==="enroll";
                            const isLast=idx===sItems.length-1;
                            return (
                              <div key={t.id} style={{display:"grid",
                                gridTemplateColumns:"minmax(180px,2fr) 110px 110px 1fr",
                                padding:"9px 16px",gap:8,alignItems:"center",
                                borderBottom:isLast?"none":"1px solid #f1f5f9",
                                background:item.overdue?"#fff8f8":"#fff"}}>
                                <div style={{fontSize:13,color:item.overdue?"#ef4444":"#0f172a",
                                  fontWeight:600,lineHeight:1.4}}>
                                  {item.overdue&&<span style={{fontSize:10,marginRight:4}}>🔴</span>}
                                  {t.task}
                                </div>
                                <select value={ts.status||"尚未進行"}
                                  onChange={e=>updateTask(s.id,t.id,"status",e.target.value,"enroll")}
                                  style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"4px 7px",
                                    fontSize:12,fontFamily:"inherit",outline:"none",cursor:"pointer",
                                    background:"#fff",color:"#0f172a",width:"100%"}}>
                                  {["尚未進行","進行中","待確認","已完成"].map(st=>(
                                    <option key={st} value={st}>{st}</option>
                                  ))}
                                </select>
                                <div style={{fontSize:12,color:item.overdue?"#ef4444":"#374151",
                                  fontWeight:item.overdue?700:400}}>
                                  {ts.dueDate||"—"}
                                </div>
                                {isEditNote
                                  ?<input autoFocus value={editVal}
                                      onChange={e=>setEditVal(e.target.value)}
                                      onBlur={()=>{updateTask(s.id,t.id,"note",editVal,"enroll");setEditCell(null);}}
                                      onKeyDown={e=>{if(e.key==="Enter"){updateTask(s.id,t.id,"note",editVal,"enroll");setEditCell(null);}}}
                                      style={{...inp(),padding:"4px 8px",fontSize:12}}/>
                                  :<button onClick={()=>{setEditCell({sid:s.id,tid:t.id,field:"note",list:"enroll"});setEditVal(ts.note||"");}}
                                      style={{background:"transparent",border:"1px dashed #e2e8f0",borderRadius:5,
                                        padding:"4px 8px",fontSize:12,cursor:"pointer",
                                        color:ts.note?"#374151":"#94a3b8",fontFamily:"inherit",
                                        width:"100%",textAlign:"left",wordBreak:"break-all",whiteSpace:"pre-wrap"}}>
                                      {ts.note||"點擊新增備註..."}
                                    </button>
                                }
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        }
      </div>
    );
  };

  const RevenueView=()=>{
    const now=new Date();
    const isConsultantRole=currentRole==="consultant";
    const [selYear,setSelYear]=React.useState(now.getFullYear());
    const [selMonth,setSelMonth]=React.useState(now.getMonth()+1);
    const [selConsultant,setSelConsultant]=React.useState(isConsultantRole?currentUser:"全部");

    const rateKey=`${selYear}-${String(selMonth).padStart(2,"0")}`;
    const rate=exchangeRates[rateKey]||31;
    const [editRate,setEditRate]=React.useState(false);
    const [rateInput,setRateInput]=React.useState("");
    const PS_COLOR={"待發放":"#94a3b8","已發放":"#10b981","已扣回":"#ef4444","取消":"#64748b","待扣回":"#f59e0b"};
    const PS_BG={"待發放":"#f8fafc","已發放":"#ecfdf5","已扣回":"#fef2f2","取消":"#f1f5f9","待扣回":"#fffbeb"};
    const PS_BORDER={"待發放":"#e2e8f0","已發放":"#6ee7b7","已扣回":"#fca5a5","取消":"#cbd5e1","待扣回":"#fde68a"};
    const StatusSelect=({sid,type,isCancelled=false})=>{
      const val=getPayStatus(sid,type);
      // 依目前狀態決定可切換的選項群組
      const isClawGroup=val==="待扣回"||val==="已扣回";
      const isCancelGroup=val==="取消";
      if(currentRole==="manager"){
        // 取消報名學生：取消/待扣回/已扣回不能改回正常發放
        const opts=isClawGroup
          ?[["待扣回","待扣回"],["已扣回","已扣回"]]
          :isCancelGroup||isCancelled
          ?[["取消","取消"]]
          :[["待發放","待發放"],["已發放","已發放"],["取消","取消"]];
        return (
          <select value={val} onChange={e=>setPS(sid,type,e.target.value)}
            disabled={isCancelled&&isCancelGroup}
            style={{border:`1.5px solid ${PS_BORDER[val]||"#e2e8f0"}`,borderRadius:7,padding:"3px 7px",
              fontSize:11,fontFamily:"inherit",outline:"none",cursor:isCancelled&&isCancelGroup?"not-allowed":"pointer",
              background:PS_BG[val]||"#f8fafc",color:PS_COLOR[val]||"#94a3b8",fontWeight:700,width:"100%",marginTop:4}}>
            {opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        );
      }
      return (
        <span style={{display:"inline-block",marginTop:4,
          border:`1.5px solid ${PS_BORDER[val]||"#e2e8f0"}`,borderRadius:7,padding:"3px 9px",
          fontSize:11,background:PS_BG[val]||"#f8fafc",color:PS_COLOR[val]||"#94a3b8",fontWeight:700}}>
          {val}
        </span>
      );
    };

    // 所有顧問列表（顧問角色只有自己）
    const consultants=isConsultantRole
      ?[currentUser]
      :["全部",...Array.from(new Set(
          [...enrolledStudents,...closedStudents.filter(s=>s.closeType==="returned")]
            .map(s=>s.consultant).filter(Boolean)
        ))];

    // 取得月份業績學生清單（以 enrollDate 判定）
    const getMonthStudents=(year,month,consultant)=>{
      return [...enrolledStudents,...closedStudents].filter(s=>{
        if(!s.enrollDate||!s.commission) return false;
        const d=new Date(s.enrollDate);
        if(d.getFullYear()!==year||d.getMonth()+1!==month) return false;
        if(consultant!=="全部"&&s.consultant!==consultant) return false;
        return true;
      });
    };
    // 取消報名學生（以取消日期計算扣除月份）
    const getCancelStudents=(year,month,consultant)=>{
      return closedStudents.filter(s=>{
        if(s.closeType!=="cancelEnroll"||!s.cancelDate||!s.commission) return false;
        const d=new Date(s.cancelDate);
        if(d.getFullYear()!==year||d.getMonth()+1!==month) return false;
        if(consultant!=="全部"&&s.consultant!==consultant) return false;
        return true;
      });
    };

    // 計算發薪日：某日期次月10日
    const nextMonth10=(dateStr)=>{
      if(!dateStr) return "—";
      const d=new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth()+2>12?1:d.getMonth()+2).padStart(2,"0")}-10`;
    };
    // 出發日前4週
    const pre4weeks=(departDate)=>{
      if(!departDate) return null;
      const d=new Date(departDate);
      d.setDate(d.getDate()-28);
      return d.toISOString().split("T")[0];
    };

    // 分潤比例
    const getLevel=(totalUSD)=>{
      if(totalUSD<=3200) return {level:"Level 1",pct:8,label:"$3,200 以下"};
      if(totalUSD<=6500) return {level:"Level 2",pct:12,label:"$3,201–$6,500"};
      if(totalUSD<=13000) return {level:"Level 3",pct:13001,label:"$6,501–$13,000"};
      return {level:"Level 4",pct:15,label:"$13,001 以上"};
    };
    const getLevelByUSD=(usd)=>{
      if(usd<=3200) return {level:"Level 1",pct:8};
      if(usd<=6500) return {level:"Level 2",pct:12};
      if(usd<=13000) return {level:"Level 3",pct:15};
      return {level:"Level 4",pct:15};
    };
    // 兼職顧問：依學生來源決定分潤比
    const getParttimePct=(studentSource)=>studentSource==="self"?45:30;
    // 判斷顧問是否為兼職
    const isParttime=(consultantName)=>{
      const m=consultantDB.find(c=>c.name===consultantName);
      return m?.employmentType==="parttime";
    };
    // 取得某學生的顧問總獎金（兼職或全職）
    const getStudentBonus=(s,rate2,fulltimePct)=>{
      const commTWD=Math.round(Number(s.commission||0)*rate2);
      if(isParttime(s.consultant)){
        const pct2=getParttimePct(s.studentSource);
        return Math.round(commTWD*pct2/100);
      }
      return Math.round(commTWD*fulltimePct/100);
    };
    // 兼職顧問發放時間點：出發日前/後14天，取當月25號
    const parttimePhase1Date=(departDate)=>{
      if(!departDate) return "出發日確定後計算";
      const d=new Date(departDate); d.setDate(d.getDate()-14);
      // 取該月25號
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;
    };
    const parttimePhase2Date=(departDate)=>{
      if(!departDate) return "出發日確定後計算";
      const d=new Date(departDate); d.setDate(d.getDate()+14);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;
    };

    const monthStudents=getMonthStudents(selYear,selMonth,selConsultant);
    const cancelStudents=getCancelStudents(selYear,selMonth,selConsultant);
    const enrollUSD=monthStudents.reduce((a,s)=>a+Number(s.commission||0),0);
    const cancelUSD=cancelStudents.reduce((a,s)=>a+Number(s.commission||0),0);
    const totalUSD=enrollUSD-cancelUSD;
    const totalTWD=Math.round(totalUSD*rate);

    // 滾動式分潤：每位顧問各自累積當月佣金（不混合計算）
    // 若篩選單一顧問，直接用該顧問當月淨佣金決定級距
    // 若顯示全部，totalUSD 是所有人合計，lvl 僅作總覽參考用
    const getLvlForConsultant=(consultantName)=>{
      // 兼職顧問：顯示兼職制（無固定級距），全職：滾動級距
      if(isParttime(consultantName)){
        return {level:"兼職制",pct:0,isParttime:true};
      }
      const cEnroll=getMonthStudents(selYear,selMonth,consultantName).reduce((a,s)=>a+Number(s.commission||0),0);
      const cCancel=getCancelStudents(selYear,selMonth,consultantName).reduce((a,s)=>a+Number(s.commission||0),0);
      return getLevelByUSD(cEnroll-cCancel);
    };
    const lvl=selConsultant==="全部"?getLevelByUSD(totalUSD):getLvlForConsultant(selConsultant);
    // 判斷目前篩選的顧問是否為兼職
    const selIsParttime=selConsultant!=="全部"&&isParttime(selConsultant);
    // 預估獎金：佣金 × 分潤比例，再扣除「待扣回」狀態的獎金（已發放但需扣回）
    // 「取消」狀態的獎金從未發放，不需扣除
    // 本月應扣回：找所有取消學生中，取消日次月10日 = 本月10日（跨月扣回）
    const thisMonthPayDay=`${selYear}-${String(selMonth).padStart(2,"0")}-10`;
    const clawbackTWD=(()=>{
      let total=0;
      [...enrolledStudents,...closedStudents].forEach(s=>{
        if(!s.cancelDate||!s.commission) return;
        // 取消日次月10日
        const cd=new Date(s.cancelDate);
        const nm=cd.getMonth()+2>12?1:cd.getMonth()+2;
        const ny=cd.getMonth()+2>12?cd.getFullYear()+1:cd.getFullYear();
        const clawDay=`${ny}-${String(nm).padStart(2,"0")}-10`;
        if(clawDay!==thisMonthPayDay) return;
        // 篩選顧問
        if(selConsultant!=="全部"&&s.consultant!==selConsultant) return;
        const commTWD2=Math.round(Number(s.commission||0)*rate);
        const sPt2=isParttime(s.consultant);
        const bonusPer2=sPt2
          ?Math.round(commTWD2*getParttimePct(s.studentSource)/100)
          :(()=>{const sLvl2=s.consultant?getLvlForConsultant(s.consultant):lvl;return Math.round(commTWD2*sLvl2.pct/100);})();
        const p1=sPt2?Math.round(bonusPer2*0.5):Math.round((bonusPer2-500)*0.5);
        const p2=sPt2?bonusPer2-Math.round(bonusPer2*0.5):bonusPer2-500-p1;
        if(getPayStatus(s.id,"phase1")==="待扣回") total+=p1;
        if(getPayStatus(s.id,"phase2")==="待扣回") total+=p2;
      });
      return total;
    })();
    // 取消報名學生（從業績扣除）
    const cancelledInMonth=cancelStudents; // getCancelStudents 已算出
    // 計算取消學生本應給予的獎金（需從預估中扣除）
    const calcStudentBonus=(s)=>{
      const cTWD=Math.round(Number(s.commission||0)*rate);
      if(isParttime(s.consultant)) return Math.round(cTWD*getParttimePct(s.studentSource)/100);
      const sLvl=getLvlForConsultant(s.consultant);
      return Math.round(cTWD*sLvl.pct/100);
    };
    const cancelledBonusTWD=cancelledInMonth.reduce((a,s)=>a+calcStudentBonus(s),0);

    // 預估顧問獎金：有效報名學生獎金 - 取消學生獎金 - 已發放待扣回
    const bonusTWD=(()=>{
      const activeBonus=monthStudents.reduce((a,s)=>a+calcStudentBonus(s),0);
      return Math.max(0,activeBonus-cancelledBonusTWD-clawbackTWD);
    })();
    // 全部模式下，全職/兼職分別統計（也扣除取消）
    const fulltimeStudents=monthStudents.filter(s=>!isParttime(s.consultant));
    const parttimeStudents=monthStudents.filter(s=>isParttime(s.consultant));
    const fulltimeCancelBonus=cancelledInMonth.filter(s=>!isParttime(s.consultant)).reduce((a,s)=>a+calcStudentBonus(s),0);
    const parttimeCancelBonus=cancelledInMonth.filter(s=>isParttime(s.consultant)).reduce((a,s)=>a+calcStudentBonus(s),0);
    const fulltimeBonusTWD=Math.max(0,fulltimeStudents.reduce((a,s)=>a+calcStudentBonus(s),0)-fulltimeCancelBonus);
    const parttimeBonusTWD=Math.max(0,parttimeStudents.reduce((a,s)=>a+calcStudentBonus(s),0)-parttimeCancelBonus);

    // 可選年月
    const years=[...new Set([now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1])];
    const months=Array.from({length:12},(_,i)=>i+1);

    // 學生明細計算
    const studentRows=monthStudents.map(s=>{
      const commUSD=Number(s.commission||0);
      const commTWD=Math.round(commUSD*rate);
      const pt=isParttime(s.consultant);
      // 取消報名學生標記
      const isCancelledStudent=s.closeType==="cancelEnroll"&&s.cancelDate;
      const incentive=pt?0:500; // 兼職顧問無激勵獎金
      // 全職顧問 + 自行開發 → 額外介紹獎金 NT$1,000
      const referralBonus=(!pt&&s.studentSource==="self"&&!isCancelledStudent)?1000:0;
      const p4w=pre4weeks(s.departDate);
      const sLvl=s.consultant?getLvlForConsultant(s.consultant):lvl;
      // 兼職：依學生來源決定分潤；全職：滾動式分潤級距
      const bonusPerStudent=pt
        ?Math.round(commTWD*getParttimePct(s.studentSource)/100)
        :Math.round(commTWD*sLvl.pct/100);
      // 兼職：行政費 + 郵寄費從第一階段扣除
      const adminFee=pt?(s.adminService==="basic"?500:s.adminService==="full"?1000:0):0;
      const postageFee=pt?Number(s.postageFee||0):0;
      const totalAdminDeduct=adminFee+postageFee;
      const phase1TWD=pt
        ?Math.round(bonusPerStudent*0.5)-totalAdminDeduct
        :Math.round((bonusPerStudent-incentive)*0.5);
      const phase2TWD=pt
        ?bonusPerStudent-Math.round(bonusPerStudent*0.5)
        :bonusPerStudent-incentive-phase1TWD;
      const incentivePayDate=s.enrollDate?nextMonth10(s.enrollDate):"—";
      const referralBonusDate=referralBonus>0?incentivePayDate:"";
      const p1Status=getPayStatus(s.id,"phase1");
      const p2Status=getPayStatus(s.id,"phase2");
      const clawbackD=s.cancelDate?nextMonth10(s.cancelDate):"";
      const phase1PayDate=p1Status==="待扣回"&&clawbackD?clawbackD:
        pt?parttimePhase1Date(s.departDate):(p4w?nextMonth10(p4w):"出發日確定後計算");
      const phase1DateLabel=p1Status==="待扣回"?(pt?"取消當月25日扣回":"取消次月10日扣回"):pt?"出發前2週當月25日":"出發前4週次月10日";
      const phase2PayDate=p2Status==="待扣回"&&clawbackD?clawbackD:
        pt?parttimePhase2Date(s.departDate):(s.departDate?nextMonth10(s.departDate):"出發日確定後計算");
      const phase2DateLabel=p2Status==="待扣回"?(pt?"取消當月25日扣回":"取消次月10日扣回"):pt?"出發後2週當月25日":"出發日次月10日";
      const ptLabel=pt?(s.studentSource==="self"?"自行開發45%":"公司來源30%"):`${sLvl.pct}%全職分潤`;
      const adminLabel=pt&&totalAdminDeduct>0?`扣行政費NT$${totalAdminDeduct}`:"";
      return {s,commUSD,commTWD,incentive,incentivePayDate,referralBonus,referralBonusDate,
              phase1TWD,phase2TWD,
              phase1PayDate,phase1DateLabel,phase2PayDate,phase2DateLabel,
              pt,ptLabel,adminFee,postageFee,totalAdminDeduct,adminLabel,isCancelledStudent};
    });

    const thStyle={padding:"9px 12px",fontSize:11,color:"#64748b",fontWeight:700,
      textAlign:"left",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"};
    const tdStyle={padding:"10px 12px",fontSize:12,color:"#0f172a",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle"};

    return (
      <div>
        {/* 篩選列 */}
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {years.map(y=>(
              <button key={y} onClick={()=>setSelYear(y)}
                style={{...btnS(selYear===y?"#fff":"transparent",selYear===y?"#0f172a":"#64748b"),
                  padding:"5px 14px",fontSize:13,boxShadow:selYear===y?"0 1px 4px rgba(0,0,0,.1)":undefined,borderRadius:7}}>
                {y}年
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {months.map(m=>(
              <button key={m} onClick={()=>setSelMonth(m)}
                style={{...btnS(selMonth===m?"#6366f1":"#f1f5f9",selMonth===m?"#fff":"#475569"),
                  padding:"5px 10px",fontSize:12,minWidth:36}}>
                {m}月
              </button>
            ))}
          </div>
          {!isConsultantRole&&(
            <div style={{display:"flex",gap:4,marginLeft:8}}>
              {consultants.map(c=>(
                <button key={c} onClick={()=>setSelConsultant(c)}
                  style={{...btnS(selConsultant===c?"#0f172a":"#f1f5f9",selConsultant===c?"#fff":"#475569"),
                    padding:"5px 12px",fontSize:12}}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 匯率設定列 */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,
          background:"#fff",borderRadius:10,padding:"10px 16px",border:"1px solid #e2e8f0"}}>
          <span style={{fontSize:13,color:"#64748b",fontWeight:700}}>💱 本月匯率（USD : TWD）</span>
          <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>1 : {rate.toFixed(1)}</span>
          {currentRole==="manager"&&(
            editRate
              ?<div style={{display:"flex",alignItems:"center",gap:6,marginLeft:8}}>
                  <input type="number" step="0.1" min="1" value={rateInput}
                    onChange={e=>setRateInput(e.target.value)}
                    placeholder="例：31.5"
                    style={{border:"1.5px solid #6366f1",borderRadius:7,padding:"5px 10px",
                      fontSize:13,fontFamily:"inherit",outline:"none",width:90}}/>
                  <button onClick={()=>{
                    const v=parseFloat(rateInput);
                    if(!isNaN(v)&&v>0){setExchangeRates(prev=>({...prev,[rateKey]:Math.round(v*10)/10}));}
                    setEditRate(false);
                  }} style={{...btnS("#6366f1"),padding:"5px 12px",fontSize:12}}>套用</button>
                  <button onClick={()=>setEditRate(false)}
                    style={{...btnS("#f1f5f9","#475569"),padding:"5px 10px",fontSize:12}}>取消</button>
                </div>
              :<button onClick={()=>{setRateInput(rate.toFixed(1));setEditRate(true);}}
                  style={{...btnS("#eef2ff","#6366f1"),padding:"4px 12px",fontSize:12,
                    border:"1px solid #c7d2fe",marginLeft:8}}>
                  ✏️ 修改匯率
                </button>
          )}
          {exchangeRates[rateKey]&&<span style={{fontSize:11,color:"#94a3b8",marginLeft:4}}>（已從預設 31.0 調整）</span>}
          <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>預設匯率 1:31.0</span>
        </div>

        {/* 當月總覽卡 */}
        <div style={{background:"linear-gradient(135deg,#1e1b4b,#4338ca)",borderRadius:14,
          padding:"20px 26px",marginBottom:16,color:"#fff",boxShadow:"0 8px 28px rgba(99,102,241,.22)"}}>
          <div style={{fontSize:13,opacity:.7,marginBottom:6}}>{selYear}年 {selMonth}月 業績總覽
            {selConsultant!=="全部"&&<span style={{marginLeft:8,background:"rgba(255,255,255,.2)",borderRadius:99,padding:"1px 10px"}}>👤 {selConsultant}</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
            {(selConsultant==="全部"?[
              {lb:"當月淨佣金（含扣除）",val:`USD $${totalUSD.toLocaleString()}`,sub:cancelUSD>0?`已扣除取消 USD $${cancelUSD.toLocaleString()}`:`≈ NT$ ${totalTWD.toLocaleString()}`},
              {lb:"全職顧問獎金合計",val:`NT$ ${fulltimeBonusTWD.toLocaleString()}`,sub:`${fulltimeStudents.length}位學生 / 滾動式分潤`},
              {lb:"兼職顧問獎金合計",val:`NT$ ${parttimeBonusTWD.toLocaleString()}`,sub:`${parttimeStudents.length}位學生 / 30%或45%`},
              {lb:"報名學生數",val:`${monthStudents.length} 位`,sub:`全職${fulltimeStudents.length}位 兼職${parttimeStudents.length}位`},
            ]:[
              {lb:"當月淨佣金（含扣除）",val:`USD $${totalUSD.toLocaleString()}`,sub:cancelUSD>0?`已扣除取消 USD $${cancelUSD.toLocaleString()}`:`≈ NT$ ${totalTWD.toLocaleString()}`},
              {lb:"適用分潤制",val:selIsParttime?"兼職分潤制":lvl.level,
                sub:selIsParttime?"公司來源30% / 自行開發45%":`${lvl.pct}% 分潤比例`},
              {lb:"預估顧問獎金",val:`NT$ ${bonusTWD.toLocaleString()}`,
                sub:selIsParttime?"依學生來源個別計算":clawbackTWD>0?`佣金×${lvl.pct}%×${rate.toFixed(1)} 已扣回 NT$${clawbackTWD.toLocaleString()}`:`佣金×${lvl.pct}%×${rate.toFixed(1)}`},
              {lb:"報名學生數",val:`${monthStudents.length} 位`,sub:"以報名日期計算"},
            ]).map(c=>(
              <div key={c.lb} style={{background:"rgba(255,255,255,.1)",borderRadius:10,padding:"12px 16px"}}>
                <div style={{fontSize:11,opacity:.7,marginBottom:4}}>{c.lb}</div>
                <div style={{fontSize:18,fontWeight:900}}>{c.val}</div>
                <div style={{fontSize:11,opacity:.6,marginTop:2}}>{c.sub}</div>
              </div>
            ))}
          </div>
          {/* 級距說明 */}
          <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
            {[
              ...(selIsParttime?[
                {level:"公司來源",range:"Company Lead",pct:"30%",active:true},
                {level:"自行開發",range:"Self-sourced",pct:"45%",active:false},
              ]:selConsultant==="全部"?[
                {level:"全職 Level 1",range:"≤ $3,200",pct:"8%",active:false},
                {level:"全職 Level 2",range:"$3,201–$6,500",pct:"12%",active:false},
                {level:"全職 Level 3/4",range:"> $6,500",pct:"15%",active:false},
                {level:"兼職 公司來源",range:"Company Lead",pct:"30%",active:false},
                {level:"兼職 自行開發",range:"Self-sourced",pct:"45%",active:false},
              ]:[
                {level:"Level 1",range:"≤ $3,200",pct:"8%",active:lvl.level==="Level 1"},
                {level:"Level 2",range:"$3,201–$6,500",pct:"12%",active:lvl.level==="Level 2"},
                {level:"Level 3",range:"$6,501–$13,000",pct:"15%",active:lvl.level==="Level 3"},
                {level:"Level 4",range:"> $13,000",pct:"15%",active:lvl.level==="Level 4"},
              ]),
            ].map(l=>(
              <div key={l.level} style={{background:l.active?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)",
                border:l.active?"1.5px solid rgba(255,255,255,.5)":"1px solid rgba(255,255,255,.15)",
                borderRadius:8,padding:"6px 12px",fontSize:11}}>
                <span style={{fontWeight:800}}>{l.level}</span>
                <span style={{opacity:.7,margin:"0 5px"}}>{l.range}</span>
                <span style={{fontWeight:700,background:l.active?"rgba(255,255,255,.3)":"transparent",
                  borderRadius:99,padding:"1px 7px"}}>{l.pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 學生明細表 */}
        {monthStudents.length===0
          ?<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",
              textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>
              此月份沒有報名學生資料
            </div>
          :<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #e2e8f0",fontWeight:800,fontSize:14,color:"#0f172a"}}>
              學生佣金明細
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
                <thead>
                  <tr>
                    {["學生姓名","報名學校","課程","佣金(USD)","佣金(TWD)","激勵獎金","激勵發放日","激勵狀態","介紹獎金","介紹獎金發放日","行政費扣除","前期獎金","前期發放日","前期狀態","後期獎金","後期發放日","後期狀態"].map(h=>(
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map(({s,commUSD,commTWD,incentive,incentivePayDate,referralBonus,referralBonusDate,phase1TWD,phase2TWD,phase1PayDate,phase1DateLabel,phase2PayDate,phase2DateLabel,pt,ptLabel,adminFee,postageFee,totalAdminDeduct,adminLabel,isCancelledStudent})=>(
                    <tr key={s.id} style={{cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8f9ff"}
                      onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td style={tdStyle}>
                        <button onClick={()=>{setSelId(s.id);setDetailTab("enroll");setView("detail");}}
                          style={{background:"transparent",border:"none",cursor:"pointer",padding:0,
                            fontFamily:"inherit",fontWeight:700,fontSize:13,color:"#6366f1"}}>
                          {s.name}
                        </button>
                        <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{s.enrollDate}</div>
                        <div style={{fontSize:10,marginTop:2}}>
                          <span style={{background:pt?"#fef9c3":"#eef2ff",color:pt?"#92400e":"#6366f1",
                            borderRadius:99,padding:"1px 6px",fontWeight:700}}>{ptLabel}</span>
                          {isCancelledStudent&&<span style={{background:"#fef2f2",color:"#ef4444",
                            borderRadius:99,padding:"1px 6px",fontWeight:700,marginLeft:4}}>取消報名</span>}
                        </div>
                        {s.studentSource==="self"&&<div style={{fontSize:10,color:"#059669",marginTop:1}}>🤝 自行開發</div>}
                        {pt&&adminLabel&&<div style={{fontSize:10,color:"#ef4444",marginTop:1}}>{adminLabel}</div>}
                      </td>
                      <td style={tdStyle}>{s.school||"—"}</td>
                      <td style={tdStyle}>{s.program||"—"}</td>
                      <td style={{...tdStyle,fontWeight:700,color:"#059669"}}>USD ${commUSD.toLocaleString()}</td>
                      <td style={{...tdStyle,fontWeight:700,color:"#059669"}}>NT$ {commTWD.toLocaleString()}</td>
                      <td style={{...tdStyle,fontWeight:700,color:pt?"#94a3b8":"#f59e0b",textAlign:"center"}}>
                        {pt?<span style={{textDecoration:"line-through",color:"#cbd5e1"}}>—</span>:`NT$ ${incentive.toLocaleString()}`}
                      </td>
                      <td style={{...tdStyle,fontSize:11,color:"#64748b"}}>
                        {pt?<span style={{color:"#cbd5e1",textDecoration:"line-through"}}>—</span>
                          :<><div>{incentivePayDate}</div><div style={{fontSize:10,color:"#94a3b8"}}>報名次月10日</div></>}
                      </td>
                      <td style={{...tdStyle,minWidth:80}}>
                        {pt?<span style={{color:"#cbd5e1"}}>—</span>:<StatusSelect sid={s.id} type="incentive" isCancelled={isCancelledStudent}/>}
                      </td>
                      {/* 介紹獎金 */}
                      <td style={{...tdStyle,fontWeight:700,color:referralBonus>0?"#f59e0b":"#94a3b8"}}>
                        {referralBonus>0?`NT$ ${referralBonus.toLocaleString()}`:"—"}
                      </td>
                      <td style={{...tdStyle,fontSize:11,color:"#64748b"}}>
                        {referralBonus>0
                          ?<><div>{referralBonusDate}</div><div style={{fontSize:10,color:"#94a3b8"}}>報名次月10日</div></>
                          :"—"}
                      </td>
                      <td style={{...tdStyle,fontSize:12,color:totalAdminDeduct>0?"#ef4444":"#94a3b8",fontWeight:totalAdminDeduct>0?700:400}}>
                        {pt&&totalAdminDeduct>0
                          ?<div>
                            <div>－NT$ {totalAdminDeduct.toLocaleString()}</div>
                            <div style={{fontSize:10,color:"#94a3b8"}}>
                              {adminFee>0&&`行政${adminFee}`}{postageFee>0&&` 郵寄${postageFee}`}
                            </div>
                          </div>
                          :<span style={{color:"#94a3b8"}}>—</span>}
                      </td>
                      <td style={{...tdStyle,color:"#6366f1",fontWeight:700}}>NT$ {phase1TWD.toLocaleString()}</td>
                      <td style={{...tdStyle,fontSize:11,color:getPayStatus(s.id,"phase1")==="待扣回"?"#ef4444":"#64748b"}}>
                        {(s.departDate||getPayStatus(s.id,"phase1")==="待扣回")
                          ?<><div>{phase1PayDate}</div><div style={{fontSize:10,color:"#94a3b8"}}>{phase1DateLabel}</div></>
                          :<span style={{color:"#94a3b8"}}>出發日確定後計算</span>}
                      </td>
                      <td style={{...tdStyle,minWidth:80}}><StatusSelect sid={s.id} type="phase1" isCancelled={isCancelledStudent}/></td>
                      <td style={{...tdStyle,color:"#6366f1",fontWeight:700}}>NT$ {phase2TWD.toLocaleString()}</td>
                      <td style={{...tdStyle,fontSize:11,color:getPayStatus(s.id,"phase2")==="待扣回"?"#ef4444":"#64748b"}}>
                        {(s.departDate||getPayStatus(s.id,"phase2")==="待扣回")
                          ?<><div>{phase2PayDate}</div><div style={{fontSize:10,color:"#94a3b8"}}>{phase2DateLabel}</div></>
                          :<span style={{color:"#94a3b8"}}>出發日確定後計算</span>}
                      </td>
                      <td style={{...tdStyle,minWidth:80}}><StatusSelect sid={s.id} type="phase2" isCancelled={isCancelledStudent}/></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#f8fafc",borderTop:"2px solid #e2e8f0"}}>
                    <td colSpan={3} style={{...tdStyle,fontWeight:800,fontSize:13}}>合計</td>
                    <td style={{...tdStyle,fontWeight:800,color:"#059669"}}>USD ${totalUSD.toLocaleString()}</td>
                    <td style={{...tdStyle,fontWeight:800,color:"#059669"}}>NT$ {totalTWD.toLocaleString()}</td>
                    <td style={{...tdStyle,fontWeight:800,color:"#f59e0b",textAlign:"center"}}>NT$ {studentRows.filter(r=>!r.pt).length*500}</td>
                    <td style={tdStyle}></td><td style={tdStyle}></td>
                    <td style={{...tdStyle,fontWeight:800,color:"#6366f1"}}>NT$ {studentRows.reduce((a,r)=>a+r.phase1TWD,0).toLocaleString()}</td>
                    <td style={tdStyle}></td><td style={tdStyle}></td>
                    <td style={{...tdStyle,fontWeight:800,color:"#6366f1"}}>NT$ {studentRows.reduce((a,r)=>a+r.phase2TWD,0).toLocaleString()}</td>
                    <td style={tdStyle}></td><td style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {cancelStudents.length>0&&(
              <div style={{padding:"14px 18px",borderTop:"2px solid #fca5a5",background:"#fef2f2"}}>
                <div style={{fontWeight:800,color:"#ef4444",fontSize:13,marginBottom:10}}>🚫 本月取消報名扣除（共 {cancelStudents.length} 位）</div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr>
                      {["學生姓名","取消日期","扣除佣金(USD)","扣除佣金(TWD)","前期獎金狀況","前期扣回日","後期獎金"].map(h=>(
                        <th key={h} style={{...thStyle,background:"#fef2f2"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cancelStudents.map(s=>{
                      const cUSD=Number(s.commission||0);
                      const cTWD=Math.round(cUSD*rate);
                      // 依負責顧問類型計算正確獎金
                      const sCancelPt=isParttime(s.consultant);
                      const sCancelBonus=sCancelPt
                        ?Math.round(cTWD*getParttimePct(s.studentSource)/100)
                        :(()=>{const sLvl3=s.consultant?getLvlForConsultant(s.consultant):lvl;return Math.round(cTWD*sLvl3.pct/100);})();
                      const adminFeeC=sCancelPt?(s.adminService==="basic"?500:s.adminService==="full"?1000:0):0;
                      const postageC=sCancelPt?Number(s.postageFee||0):0;
                      const p1=sCancelPt
                        ?Math.round(sCancelBonus*0.5)-(adminFeeC+postageC)
                        :Math.round((sCancelBonus-500)*0.5);
                      const p2=sCancelPt
                        ?sCancelBonus-Math.round(sCancelBonus*0.5)
                        :sCancelBonus-500-p1;
                      const p1St=getPayStatus(s.id,"phase1");
                      const clawDay=sCancelPt
                        ?(s.cancelDate?(()=>{const d=new Date(s.cancelDate);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;})():"")
                        :(s.cancelDate?nextMonth10(s.cancelDate):"");
                      return (
                        <tr key={s.id}>
                          <td style={{...tdStyle,fontWeight:700,color:"#ef4444"}}>{s.name}
                            <div style={{fontSize:10,color:"#94a3b8"}}>{sCancelPt?"兼職":"全職"}</div>
                          </td>
                          <td style={tdStyle}>{s.cancelDate||"—"}</td>
                          <td style={{...tdStyle,fontWeight:700,color:"#ef4444"}}>－USD ${cUSD.toLocaleString()}</td>
                          <td style={{...tdStyle,fontWeight:700,color:"#ef4444"}}>－NT$ {cTWD.toLocaleString()}</td>
                          <td style={{...tdStyle,color:(p1St==="已發放"||p1St==="待扣回"||p1St==="已扣回")?"#ef4444":"#10b981",fontWeight:700}}>
                            {(p1St==="已發放"||p1St==="待扣回"||p1St==="已扣回")
                              ?`已發 NT$${p1.toLocaleString()}，需扣回`:"未發放，無需扣回"}
                          </td>
                          <td style={{...tdStyle,color:"#ef4444",fontSize:11}}>
                            {(p1St==="已發放"||p1St==="待扣回"||p1St==="已扣回")?clawDay:"—"}
                          </td>
                          <td style={{...tdStyle,color:"#ef4444",fontWeight:700}}>
                            NT${p2.toLocaleString()} 取消，不予發放
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#fef2f2",borderTop:"1.5px solid #fca5a5"}}>
                      <td colSpan={2} style={{...tdStyle,fontWeight:800,color:"#ef4444"}}>本月扣除合計</td>
                      <td style={{...tdStyle,fontWeight:800,color:"#ef4444"}}>－USD ${cancelUSD.toLocaleString()}</td>
                      <td style={{...tdStyle,fontWeight:800,color:"#ef4444"}}>－NT$ {Math.round(cancelUSD*rate).toLocaleString()}</td>
                      <td colSpan={2} style={tdStyle}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div style={{padding:"10px 18px",background:"#fffbeb",borderTop:"1px solid #fde68a",
              fontSize:12,color:"#92400e"}}>
              💡 全職顧問：激勵獎金 NT$500 於報名當下發放；自行開發學生額外獲介紹獎金 NT$1,000（同天）。前期獎金＝（總獎金－NT$500）×50%，後期＝總獎金－NT$500－前期。兼職顧問：無激勵獎金；前期＝總獎金50%－行政費，後期＝另50%，分別於出發前14日／入學後14日發放。
            </div>
          </div>
        }
      </div>
    );
  };

  // ── 每月應發放獎金 ──────────────────────────────────────────────
  const PaymentView=()=>{
    const isParttime=isParttimeGlobal; // 使用全域 helper
    const now=new Date();
    const [selYear,setSelYear]=React.useState(now.getFullYear());
    const [selMonth,setSelMonth]=React.useState(now.getMonth()+1);
    const years=[...new Set([now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1])];
    const months=Array.from({length:12},(_,i)=>i+1);
    const [selPayConsultant,setSelPayConsultant]=React.useState("全部");
    const rateKey2=`${selYear}-${String(selMonth).padStart(2,"0")}`;
    const rate2=exchangeRates[rateKey2]||31;
    const payDay10=`${selYear}-${String(selMonth).padStart(2,"0")}-10`;  // 全職發薪日
    const payDay25=`${selYear}-${String(selMonth).padStart(2,"0")}-25`;  // 兼職發薪日
    const payDay=payDay10; // 保留舊變數供全職計算用

    const nextM10=(dateStr)=>{
      if(!dateStr) return "";
      const d=new Date(dateStr);
      const nm=d.getMonth()+2>12?1:d.getMonth()+2;
      const ny=d.getMonth()+2>12?d.getFullYear()+1:d.getFullYear();
      return `${ny}-${String(nm).padStart(2,"0")}-10`;
    };
    const pre4w=(departDate)=>{
      if(!departDate) return null;
      const d=new Date(departDate); d.setDate(d.getDate()-28);
      return d.toISOString().split("T")[0];
    };

    const allStudents=[...enrolledStudents,...closedStudents].filter(s=>s.enrollDate&&s.commission);
    const payItems=[];   // 當月應發放
    const clawItems=[];  // 當月應扣回
    allStudents.forEach(s=>{
      const commUSD=Number(s.commission||0);
      const commTWD=Math.round(commUSD*rate2);
      const ptPay=isParttime(s.consultant);
      // 分潤計算
      let bonusPay, phase1TWD, phase2TWD;
      if(ptPay){
        const ptPct2=s.studentSource==="self"?45:30;
        bonusPay=Math.round(commTWD*ptPct2/100);
        const adminFeeP=s.adminService==="basic"?500:s.adminService==="full"?1000:0;
        const postageP=Number(s.postageFee||0);
        phase1TWD=Math.round(bonusPay*0.5)-(adminFeeP+postageP);
        phase2TWD=bonusPay-Math.round(bonusPay*0.5);
      } else {
        const consultantMonthUSD=[...enrolledStudents,...closedStudents]
          .filter(x=>x.consultant===s.consultant&&x.enrollDate&&
            new Date(x.enrollDate).getFullYear()===selYear&&
            new Date(x.enrollDate).getMonth()+1===selMonth)
          .reduce((a,x)=>a+Number(x.commission||0),0);
        const pctForPay=(usd)=>{if(usd<=3200)return 8;if(usd<=6500)return 12;return 15;};
        bonusPay=Math.round(commTWD*pctForPay(consultantMonthUSD)/100);
        phase1TWD=Math.round((bonusPay-500)*0.5);
        phase2TWD=bonusPay-500-phase1TWD;
      }
      // 發放日：全職用次月10日；兼職用出發前14日／入學後14日
      const p4w=pre4w(s.departDate);
      const ptDay25=(dep,offset)=>{
        if(!dep) return "";
        const d=new Date(dep); d.setDate(d.getDate()+offset);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;
      };
      const phase1PayDayCalc=ptPay?ptDay25(s.departDate,-14):(p4w?nextM10(p4w):"");
      const phase2PayDayCalc=ptPay?ptDay25(s.departDate,14):(s.departDate?nextM10(s.departDate):"");
      const st1=getPayStatus(s.id,"incentive"),st2=getPayStatus(s.id,"phase1"),st3=getPayStatus(s.id,"phase2");
      // 激勵獎金（只有全職）
      if(!ptPay&&nextM10(s.enrollDate)===payDay&&st1!=="取消"&&st1!=="待扣回")
        payItems.push({s,type:"incentive",amt:500,label:"激勵獎金",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"});
      // 全職自行開發介紹獎金
      if(!ptPay&&s.studentSource==="self"&&nextM10(s.enrollDate)===payDay)
        payItems.push({s,type:"referral",amt:1000,label:"介紹獎金",color:"#10b981",bg:"#ecfdf5",border:"#6ee7b7"});
      // 前期獎金（已發放也顯示，才不會勾完就消失）
      const targetDay=ptPay?payDay25:payDay10;
      if(phase1PayDayCalc===targetDay&&st2!=="取消"&&st2!=="待扣回"&&st2!=="已扣回")
        payItems.push({s,type:"phase1",amt:phase1TWD,label:ptPay?"前期獎金（25日）":"前期獎金",color:"#6366f1",bg:"#eef2ff",border:"#c7d2fe"});
      // 後期獎金
      if(phase2PayDayCalc===targetDay&&st3!=="取消"&&st3!=="待扣回"&&st3!=="已扣回")
        payItems.push({s,type:"phase2",amt:phase2TWD,label:ptPay?"後期獎金（25日）":"後期獎金",color:"#059669",bg:"#ecfdf5",border:"#6ee7b7"});
      // 應扣回：全職=取消日次月10日，兼職=取消日當月25日
      const clawD=s.cancelDate?(ptPay?ptDay25(s.cancelDate,0):nextM10(s.cancelDate)):"";
      // 顯示條件：扣回日 = 本月目標日，或狀態已是「已扣回」（勾選後仍顯示）
      const showClaw=clawD===targetDay;
      const showClawIfDone=(st2==="已扣回"||st3==="已扣回")&&clawD===targetDay;
      if(showClaw&&(st2==="待扣回"||st2==="已扣回"))
        clawItems.push({s,type:"phase1",amt:Math.abs(phase1TWD),label:"前期獎金扣回",color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
      if(showClaw&&(st3==="待扣回"||st3==="已扣回"))
        clawItems.push({s,type:"phase2",amt:phase2TWD,label:"後期獎金扣回",color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
      // 全職取消但尚未到扣回日（本月可見，待確認）：在取消日當月也顯示
      if(!ptPay&&s.cancelDate&&(st2==="待扣回"||st2==="已扣回")&&clawD!==targetDay){
        const cancelYM=s.cancelDate.slice(0,7);
        const thisYM=`${selYear}-${String(selMonth).padStart(2,"0")}`;
        // 取消日在本月 → 也顯示（扣回日在下個月，但本月讓管理者知道）
        if(cancelYM===thisYM)
          clawItems.push({s,type:"phase1",amt:Math.abs(phase1TWD),
            label:`前期獎金扣回（扣回日 ${clawD}）`,color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
      }
      if(!ptPay&&s.cancelDate&&(st3==="待扣回"||st3==="已扣回")&&clawD!==targetDay){
        const cancelYM=s.cancelDate.slice(0,7);
        const thisYM=`${selYear}-${String(selMonth).padStart(2,"0")}`;
        if(cancelYM===thisYM)
          clawItems.push({s,type:"phase2",amt:phase2TWD,
            label:`後期獎金扣回（扣回日 ${clawD}）`,color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
      }
    });

    const consultantGroups={};
    payItems.forEach(item=>{
      const c=item.s.consultant||"未指定";
      if(!consultantGroups[c]) consultantGroups[c]={pay:[],claw:[]};
      consultantGroups[c].pay.push(item);
    });
    clawItems.forEach(item=>{
      const c=item.s.consultant||"未指定";
      if(!consultantGroups[c]) consultantGroups[c]={pay:[],claw:[]};
      consultantGroups[c].claw.push(item);
    });
    const grandTotal=payItems.reduce((a,x)=>a+x.amt,0);
    const grandClaw=clawItems.reduce((a,x)=>a+x.amt,0);
    const grandNet=grandTotal-grandClaw;

    return (
      <div>
        {/* 篩選列 */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {years.map(y=>(
              <button key={y} onClick={()=>setSelYear(y)}
                style={{...btnS(selYear===y?"#fff":"transparent",selYear===y?"#0f172a":"#64748b"),
                  padding:"5px 14px",fontSize:13,boxShadow:selYear===y?"0 1px 4px rgba(0,0,0,.1)":undefined,borderRadius:7}}>
                {y}年
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {months.map(m=>(
              <button key={m} onClick={()=>setSelMonth(m)}
                style={{...btnS(selMonth===m?"#6366f1":"#f1f5f9",selMonth===m?"#fff":"#475569"),
                  padding:"5px 10px",fontSize:12,minWidth:36}}>{m}月</button>
            ))}
          </div>
          {/* 顧問篩選 - 從所有顧問DB取得，不只限有資料的 */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#64748b"}}>顧問：</span>
            {["全部",...consultantDB.filter(m=>m.role==="consultant"||m.role==="manager").map(m=>m.name)].map(c=>(
              <button key={c} onClick={()=>setSelPayConsultant(c)}
                style={{...btnS(selPayConsultant===c?"#6366f1":"#f1f5f9",selPayConsultant===c?"#fff":"#475569"),
                  padding:"5px 12px",fontSize:12}}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 總覽：10號全職 + 25號兼職 */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[
            {label:`${selYear}年${selMonth}月 10日（全職發薪）`,
             // 應發 = payItems + 已扣回clawItems（原本已發過的）
             pay:(()=>{
               const p=payItems.filter(x=>!isParttime(x.s.consultant)).reduce((a,x)=>a+x.amt,0);
               const c=clawItems.filter(x=>!isParttime(x.s.consultant)&&getPayStatus(x.s.id,x.type)==="已扣回").reduce((a,x)=>a+x.amt,0);
               return p+c;
             })(),
             claw:clawItems.filter(x=>!isParttime(x.s.consultant)).reduce((a,x)=>a+x.amt,0)},
            {label:`${selYear}年${selMonth}月 25日（兼職發薪）`,
             pay:(()=>{
               const p=payItems.filter(x=>isParttime(x.s.consultant)).reduce((a,x)=>a+x.amt,0);
               const c=clawItems.filter(x=>isParttime(x.s.consultant)&&getPayStatus(x.s.id,x.type)==="已扣回").reduce((a,x)=>a+x.amt,0);
               return p+c;
             })(),
             claw:clawItems.filter(x=>isParttime(x.s.consultant)).reduce((a,x)=>a+x.amt,0)},
          ].map(grp=>{
            const net=grp.pay-grp.claw;
            return (
              <div key={grp.label} style={{background:"linear-gradient(135deg,#1e1b4b,#4338ca)",
                borderRadius:14,padding:"14px 20px",color:"#fff"}}>
                <div style={{fontSize:11,opacity:.7,marginBottom:4}}>{grp.label}</div>
                <div style={{fontSize:22,fontWeight:900,color:net<0?"#fca5a5":"#fff"}}>
                  NT$ {net.toLocaleString()}
                </div>
                <div style={{fontSize:11,opacity:.6,marginTop:2}}>
                  應發 NT${grp.pay.toLocaleString()}
                  {grp.claw>0&&<span style={{color:"#fca5a5",marginLeft:4}}>／ 應扣回 NT${grp.claw.toLocaleString()}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 顧問篩選後的 groups */}
        {(()=>{
          const filteredPay=selPayConsultant==="全部"?payItems:payItems.filter(x=>(x.s.consultant||"未指定")===selPayConsultant);
          const filteredClaw=selPayConsultant==="全部"?clawItems:clawItems.filter(x=>(x.s.consultant||"未指定")===selPayConsultant);
          if(filteredPay.length===0&&filteredClaw.length===0) return (
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:32}}>
              <div style={{textAlign:"center",color:"#94a3b8",fontSize:14,marginBottom:16}}>
                📭 {selPayConsultant==="全部"?"":selPayConsultant+" "}{selYear}年{selMonth}月 無應發放或扣回獎金
              </div>
              <div style={{fontSize:12,color:"#64748b",background:"#f8fafc",borderRadius:8,padding:"10px 14px",lineHeight:1.8}}>
                💡 發放日期說明：<br/>
                · 全職顧問激勵獎金：報名次月10日<br/>
                · 全職顧問前期獎金：出發前4週的次月10日<br/>
                · 全職顧問後期獎金：出發日次月10日<br/>
                · 兼職顧問前期獎金：出發前14天的當月25日<br/>
                · 兼職顧問後期獎金：出發後14天的當月25日<br/>
                <span style={{color:"#6366f1"}}>請切換月份查看各月應發放款項。</span>
              </div>
            </div>
          );
          // 依顧問分組
          const groups={};
          [...filteredPay,...filteredClaw].forEach(item=>{
            const c=item.s.consultant||"未指定";
            if(!groups[c]) groups[c]={pay:[],claw:[]};
            if(item.label.includes("扣回")) groups[c].claw.push(item);
            else groups[c].pay.push(item);
          });
          return <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {Object.entries(groups).map(([consultant,grpItems])=>{
            const {pay:payList,claw:clawList}=grpItems;
            const payTotal=payList.reduce((a,x)=>a+x.amt,0);
            const clawTotal=clawList.reduce((a,x)=>a+x.amt,0);
            const netTotal=payTotal-clawTotal;
            const isGrpParttime=isParttime(consultant);
            const allDone=[...payList,...clawList].every(x=>{
              const st=getPayStatus(x.s.id,x.type);
              return st==="已發放"||st==="已扣回";
            });
            const toggleAll=(checked)=>{
              payList.forEach(x=>setPS(x.s.id,x.type,checked?"已發放":"待發放"));
              clawList.forEach(x=>setPS(x.s.id,x.type,checked?"已扣回":"待扣回"));
            };
            return (
              <div key={consultant} style={{background:"#fff",borderRadius:12,
                border:`1px solid ${isGrpParttime?"#fde68a":"#e2e8f0"}`,overflow:"hidden",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",
                  background:isGrpParttime?"#fffbeb":"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                  <Avatar name={consultant} size={32}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>
                      {consultant}
                      <span style={{marginLeft:6,fontSize:11,fontWeight:600,
                        color:isGrpParttime?"#92400e":"#6366f1"}}>
                        {isGrpParttime?"兼職（25日）":"全職（10日）"}
                      </span>
                    </div>
                    <div style={{fontSize:11,color:"#64748b"}}>
                      應發 NT${payTotal.toLocaleString()}
                      {clawTotal>0&&<span style={{color:"#ef4444",marginLeft:6}}>扣回 NT${clawTotal.toLocaleString()}</span>}
                      　實領 <strong style={{color:netTotal>=0?"#059669":"#ef4444"}}>NT${netTotal.toLocaleString()}</strong>
                    </div>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                    background:allDone?"#ecfdf5":"#f1f5f9",border:`1.5px solid ${allDone?"#6ee7b7":"#e2e8f0"}`,
                    borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,
                    color:allDone?"#059669":"#64748b"}}>
                    <input type="checkbox" checked={allDone} onChange={e=>toggleAll(e.target.checked)}
                      style={{accentColor:"#10b981",width:15,height:15,cursor:"pointer"}}/>
                    {allDone?"✅ 已全數處理":"標記全部完成"}
                  </label>
                </div>
                {payList.length>0&&<>
                  <div style={{padding:"5px 18px",background:"#f0fdf4",fontSize:11,fontWeight:700,
                    color:"#059669",borderBottom:"1px solid #f1f5f9"}}>
                    ✅ 應發放 {payList.length} 筆　NT$ {payTotal.toLocaleString()}
                  </div>
                  {payList.map((item,idx)=>{
                    const paid=getPayStatus(item.s.id,item.type)==="已發放";
                    return (
                      <div key={`pay_${item.s.id}_${item.type}`} style={{
                        display:"flex",alignItems:"center",gap:12,padding:"10px 18px",
                        borderBottom:"1px solid #f1f5f9",background:paid?"#f9fffe":"#fff"}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontWeight:700,fontSize:13}}>{item.s.name}</span>
                            <span style={{background:item.bg,color:item.color,border:`1px solid ${item.border}`,
                              borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:700}}>{item.label}</span>
                          </div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{item.s.school} {item.s.program}</div>
                        </div>
                        <span style={{fontWeight:800,fontSize:14,color:paid?"#059669":item.color,minWidth:90,textAlign:"right"}}>
                          NT$ {item.amt.toLocaleString()}
                        </span>
                        <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                          background:paid?"#ecfdf5":"#f1f5f9",border:`1.5px solid ${paid?"#6ee7b7":"#e2e8f0"}`,
                          borderRadius:7,padding:"5px 11px",fontSize:12,fontWeight:700,
                          color:paid?"#059669":"#64748b",whiteSpace:"nowrap"}}>
                          <input type="checkbox" checked={paid}
                            onChange={e=>setPS(item.s.id,item.type,e.target.checked?"已發放":"待發放")}
                            style={{accentColor:"#10b981",width:14,height:14,cursor:"pointer"}}/>
                          {paid?"已付款":"標記付款"}
                        </label>
                      </div>
                    );
                  })}
                </>}
                {clawList.length>0&&<>
                  <div style={{padding:"5px 18px",background:"#fef2f2",fontSize:11,fontWeight:700,
                    color:"#ef4444",borderTop:"1.5px solid #fca5a5",borderBottom:"1px solid #fca5a5"}}>
                    🔴 應扣回 {clawList.length} 筆　NT$ {clawTotal.toLocaleString()}
                  </div>
                  {clawList.map((item,idx)=>{
                    const clawed=getPayStatus(item.s.id,item.type)==="已扣回";
                    return (
                      <div key={`claw_${item.s.id}_${item.type}`} style={{
                        display:"flex",alignItems:"center",gap:12,padding:"10px 18px",
                        borderBottom:idx===clawList.length-1?"none":"1px solid #f1f5f9",
                        background:clawed?"#fff8f8":"#fff"}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontWeight:700,fontSize:13,color:"#ef4444"}}>{item.s.name}</span>
                            <span style={{background:item.bg,color:item.color,border:`1px solid ${item.border}`,
                              borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:700}}>{item.label}</span>
                          </div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{item.s.school} {item.s.program}</div>
                        </div>
                        <span style={{fontWeight:800,fontSize:14,color:"#ef4444",minWidth:90,textAlign:"right"}}>
                          －NT$ {item.amt.toLocaleString()}
                        </span>
                        <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                          background:clawed?"#fef2f2":"#f1f5f9",border:`1.5px solid ${clawed?"#fca5a5":"#e2e8f0"}`,
                          borderRadius:7,padding:"5px 11px",fontSize:12,fontWeight:700,
                          color:clawed?"#ef4444":"#64748b",whiteSpace:"nowrap"}}>
                          <input type="checkbox" checked={clawed}
                            onChange={e=>setPS(item.s.id,item.type,e.target.checked?"已扣回":"待扣回")}
                            style={{accentColor:"#ef4444",width:14,height:14,cursor:"pointer"}}/>
                          {clawed?"已扣回":"標記扣回"}
                        </label>
                      </div>
                    );
                  })}
                </>}
              </div>
            );
          })}
          </div>;
        })()}
        
      </div>
    );
  };

  // ── 我的獎金明細（顧問專屬）────────────────────────────────────
  const MyBonusView=()=>{
    const now=new Date();
    const [selYear,setSelYear]=React.useState(now.getFullYear());
    const [selMonth,setSelMonth]=React.useState(now.getMonth()+1);
    const years=[...new Set([now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1])];
    const months=Array.from({length:12},(_,i)=>i+1);

    const rateKey2=`${selYear}-${String(selMonth).padStart(2,"0")}`;
    const rate2=exchangeRates[rateKey2]||31;
    const payDay10=`${selYear}-${String(selMonth).padStart(2,"0")}-10`; // 全職
    const payDay25=`${selYear}-${String(selMonth).padStart(2,"0")}-25`; // 兼職
    // 目前顧問的類型
    const myIsParttime=isParttimeGlobal(currentUser);
    const payDay=myIsParttime?payDay25:payDay10;

    const nextM10=(dateStr)=>{
      if(!dateStr) return "";
      const d=new Date(dateStr);
      const nm=d.getMonth()+2>12?1:d.getMonth()+2;
      const ny=d.getMonth()+2>12?d.getFullYear()+1:d.getFullYear();
      return `${ny}-${String(nm).padStart(2,"0")}-10`;
    };
    const pre4w=(dep)=>{
      if(!dep) return null;
      const d=new Date(dep); d.setDate(d.getDate()-28);
      return d.toISOString().split("T")[0];
    };
    const pctFn=(usd)=>{if(usd<=3200)return 8;if(usd<=6500)return 12;return 15;};

    // 當月顧問累積佣金決定級距（只算自己）
    const myMonthUSD=[...enrolledStudents,...closedStudents]
      .filter(s=>s.consultant===currentUser&&s.enrollDate&&
        new Date(s.enrollDate).getFullYear()===selYear&&
        new Date(s.enrollDate).getMonth()+1===selMonth)
      .reduce((a,s)=>a+Number(s.commission||0),0);
    const myPct=pctFn(myMonthUSD);

    // 所有我負責的學生
    const myStudents=[...enrolledStudents,...closedStudents].filter(s=>s.consultant===currentUser&&s.commission);

    // 收集本月10日我的預計收入項目
    const incomeItems=[];
    const clawItems=[];

    myStudents.forEach(s=>{
      const commUSD=Number(s.commission||0);
      const commTWD=Math.round(commUSD*rate2);
      const pt=isParttimeGlobal(currentUser);
      const incentive=500;

      // 分潤計算：兼職依學生來源，全職依滾動級距
      let bonusTot;
      if(pt){
        const ptPct=s.studentSource==="self"?45:30;
        bonusTot=Math.round(commTWD*ptPct/100);
      } else {
        const sMonthUSD=[...enrolledStudents,...closedStudents]
          .filter(x=>x.consultant===currentUser&&x.enrollDate&&
            x.enrollDate.slice(0,7)===(s.enrollDate||"").slice(0,7))
          .reduce((a,x)=>a+Number(x.commission||0),0);
        bonusTot=Math.round(commTWD*pctFn(sMonthUSD)/100);
      }

      // 行政費（兼職）
      const adminFeeM=pt?(s.adminService==="basic"?500:s.adminService==="full"?1000:0):0;
      const postageFeeM=pt?Number(s.postageFee||0):0;
      const totalDeductM=adminFeeM+postageFeeM;

      // 獎金計算
      const p1=pt
        ?Math.round(bonusTot*0.5)-totalDeductM           // 兼職：50%扣行政費
        :Math.round((bonusTot-incentive)*0.5);            // 全職：(總獎金-激勵)×50%
      const p2=pt
        ?bonusTot-Math.round(bonusTot*0.5)               // 兼職：另50%
        :bonusTot-incentive-p1;                           // 全職：總獎金-激勵-前期

      // 發放日計算
      const p4w=pre4w(s.departDate);
      const ptDay25M=(dep,offset)=>{
        if(!dep) return "";
        const d=new Date(dep); d.setDate(d.getDate()+offset);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;
      };
      const phase1PayD=pt?ptDay25M(s.departDate,-14):(p4w?nextM10(p4w):"");
      const phase2PayD=pt?ptDay25M(s.departDate,14):(s.departDate?nextM10(s.departDate):"");

      // 激勵獎金（全職才有，固定10號）
      if(!pt&&nextM10(s.enrollDate)===payDay10)
        incomeItems.push({s,type:"incentive",amt:incentive,label:"激勵獎金",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",
          st:getPayStatus(s.id,"incentive")});
      // 全職自行開發介紹獎金
      const rBonusM=(!pt&&s.studentSource==="self")?1000:0;
      if(rBonusM>0&&nextM10(s.enrollDate)===payDay10)
        incomeItems.push({s,type:"referral",amt:rBonusM,label:"介紹獎金",color:"#10b981",bg:"#ecfdf5",border:"#6ee7b7",
          st:getPayStatus(s.id,"referral")});
      // 全職比對10號，兼職比對25號
      const myTargetDay=pt?payDay25:payDay10;
      const isCancelled=s.closeType==="cancelEnroll"&&s.cancelDate;
      const cancelDateStr=s.cancelDate||"";

      // 前期獎金
      const p1St=getPayStatus(s.id,"phase1");
      const phase1PayD_target=phase1PayD===myTargetDay;
      if(phase1PayD_target){
        if(isCancelled&&p1St==="待發放"){
          // 取消報名且尚未付款 → 顯示為取消項目（紅字扣除）
          clawItems.push({s,type:"phase1",amt:p1,
            label:`前期獎金取消（取消日 ${cancelDateStr}）`,
            color:"#ef4444",bg:"#fef2f2",border:"#fca5a5",isCancelNotPaid:true});
        } else if(!isCancelled||p1St!=="取消"){
          incomeItems.push({s,type:"phase1",amt:p1,
            label:pt?"前期獎金（出發前14日）":"前期獎金",
            color:"#6366f1",bg:"#eef2ff",border:"#c7d2fe",
            st:p1St,
            sub:pt&&totalDeductM>0?`已扣行政費NT$${totalDeductM}`:"",
          });
        }
      }

      // 後期獎金
      const p2St=getPayStatus(s.id,"phase2");
      const phase2PayD_target=phase2PayD===myTargetDay;
      if(phase2PayD_target){
        if(isCancelled&&p2St==="待發放"){
          clawItems.push({s,type:"phase2",amt:p2,
            label:`後期獎金取消（取消日 ${cancelDateStr}）`,
            color:"#ef4444",bg:"#fef2f2",border:"#fca5a5",isCancelNotPaid:true});
        } else if(!isCancelled||p2St!=="取消"){
          incomeItems.push({s,type:"phase2",amt:p2,
            label:pt?"後期獎金（入學後14日）":"後期獎金",
            color:"#059669",bg:"#ecfdf5",border:"#6ee7b7",
            st:p2St});
        }
      }

      // 應扣回（已發放但需追回）
      const clawD=cancelDateStr?(pt
        ?(()=>{const d=new Date(cancelDateStr);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-25`;})()
        :nextM10(cancelDateStr)):"";
      if(clawD===myTargetDay&&(p1St==="待扣回"||p1St==="已扣回"))
        clawItems.push({s,type:"phase1",amt:Math.abs(p1),label:`前期獎金扣回（取消日 ${cancelDateStr}）`,
          color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
      if(clawD===myTargetDay&&(p2St==="待扣回"||p2St==="已扣回"))
        clawItems.push({s,type:"phase2",amt:p2,label:`後期獎金扣回（取消日 ${cancelDateStr}）`,
          color:"#ef4444",bg:"#fef2f2",border:"#fca5a5"});
    });

    const incomeTotal=incomeItems.reduce((a,x)=>a+x.amt,0);
    const clawTotal=clawItems.reduce((a,x)=>a+x.amt,0);
    // 已扣回：狀態為「已扣回」的才算真正扣除
    const alreadyClawedTotal=clawItems.filter(x=>getPayStatus(x.s.id,x.type)==="已扣回").reduce((a,x)=>a+x.amt,0);
    // 實領 = 預計收入 - 已扣回（不含「待扣回」）
    const netTotal=incomeTotal-alreadyClawedTotal;

    const ItemRow=({item,isClaw=false,extraNote=""})=>{
      // 扣回項目也要讀實際狀態（已扣回/待扣回）
      const st=isClaw?getPayStatus(item.s.id,item.type):item.st||"待發放";
      const stColor={"待發放":"#94a3b8","已發放":"#10b981","取消":"#64748b","待扣回":"#f59e0b","已扣回":"#ef4444"}[st]||"#94a3b8";
      const stBg={"待發放":"#f8fafc","已發放":"#ecfdf5","取消":"#f1f5f9","待扣回":"#fffbeb","已扣回":"#fef2f2"}[st]||"#f8fafc";
      return (
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",
          borderBottom:"1px solid #f1f5f9",background:st==="已發放"||st==="已扣回"?"#f9fffe":"#fff"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{fontWeight:700,fontSize:13,color:isClaw?"#ef4444":"#0f172a"}}>{item.s.name}</span>
              <span style={{background:item.bg,color:item.color,border:`1px solid ${item.border}`,
                borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:700}}>{item.label}</span>
              {item.sub&&<span style={{fontSize:10,color:"#ef4444"}}>({item.sub})</span>}
            </div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{item.s.school} {item.s.program}　報名日 {item.s.enrollDate}</div>
            {extraNote&&<div style={{fontSize:11,color:"#f59e0b",fontWeight:600,marginTop:1}}>⚠️ {extraNote}</div>}
          </div>
          <span style={{fontWeight:800,fontSize:14,color:isClaw?"#ef4444":item.color,minWidth:90,textAlign:"right"}}>
            {isClaw?"－":""}NT$ {item.amt.toLocaleString()}
          </span>
          <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:7,
            background:stBg,color:stColor,border:`1px solid ${stColor}30`,whiteSpace:"nowrap"}}>
            {st}
          </span>
        </div>
      );
    };

    return (
      <div>
        {/* 篩選列 */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {years.map(y=>(
              <button key={y} onClick={()=>setSelYear(y)}
                style={{...btnS(selYear===y?"#fff":"transparent",selYear===y?"#0f172a":"#64748b"),
                  padding:"5px 14px",fontSize:13,boxShadow:selYear===y?"0 1px 4px rgba(0,0,0,.1)":undefined,borderRadius:7}}>
                {y}年
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {months.map(m=>(
              <button key={m} onClick={()=>setSelMonth(m)}
                style={{...btnS(selMonth===m?"#6366f1":"#f1f5f9",selMonth===m?"#fff":"#475569"),
                  padding:"5px 10px",fontSize:12,minWidth:36}}>{m}月</button>
            ))}
          </div>
        </div>

        {/* 總覽卡 */}
        <div style={{background:"linear-gradient(135deg,#1e1b4b,#4338ca)",borderRadius:14,
          padding:"18px 24px",marginBottom:16,color:"#fff"}}>
          <div style={{fontSize:12,opacity:.7,marginBottom:6}}>{selYear}年 {selMonth}月 {myIsParttime?"25":"10"}日　{currentUser} 預計獎金（{myIsParttime?"兼職":"全職"}）</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:clawItems.length?12:0}}>
            <div style={{background:"rgba(255,255,255,.1)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:11,opacity:.7,marginBottom:3}}>預計收入</div>
              <div style={{fontSize:18,fontWeight:900}}>NT$ {incomeTotal.toLocaleString()}</div>
              <div style={{fontSize:11,opacity:.6,marginTop:2}}>{incomeItems.length} 筆</div>
            </div>
            <div style={{background:"rgba(239,68,68,.15)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:11,opacity:.7,marginBottom:3}}>應扣回</div>
              <div style={{fontSize:18,fontWeight:900,color:"#fca5a5"}}>－NT$ {clawTotal.toLocaleString()}</div>
              <div style={{fontSize:11,opacity:.6,marginTop:2}}>{clawItems.length} 筆</div>
            </div>
            <div style={{background:"rgba(239,68,68,.25)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:11,opacity:.7,marginBottom:3}}>已扣回</div>
              <div style={{fontSize:18,fontWeight:900,color:"#fca5a5"}}>－NT$ {alreadyClawedTotal.toLocaleString()}</div>
              <div style={{fontSize:11,opacity:.6,marginTop:2}}>{clawItems.filter(x=>getPayStatus(x.s.id,x.type)==="已扣回").length} 筆</div>
            </div>
            <div style={{background:"rgba(255,255,255,.15)",borderRadius:10,padding:"12px 14px",border:"1.5px solid rgba(255,255,255,.3)"}}>
              <div style={{fontSize:11,opacity:.7,marginBottom:3}}>實領金額</div>
              <div style={{fontSize:20,fontWeight:900,color:netTotal>=0?"#a5f3fc":"#fca5a5"}}>NT$ {netTotal.toLocaleString()}</div>
              <div style={{fontSize:11,opacity:.6,marginTop:2}}>匯率 1:{rate2.toFixed(1)}</div>
            </div>
          </div>
          {clawItems.length>0&&<div style={{background:"rgba(239,68,68,.2)",borderRadius:8,padding:"7px 12px",fontSize:12}}>
            🔴 本月有 {clawItems.length} 筆因取消報名產生的扣回款項
          </div>}
        </div>

        {incomeItems.length===0&&clawItems.length===0
          ?<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",
              textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>
              📭 {selYear}年{selMonth}月{myIsParttime?"25":"10"}日無預計獎金項目
            </div>
          :<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            {/* 應收明細 */}
            {incomeItems.length>0&&<>
              <div style={{padding:"8px 18px",background:"#f0fdf4",fontSize:11,fontWeight:700,color:"#059669",borderBottom:"1px solid #e2e8f0"}}>
                ✅ 應收明細　{incomeItems.length} 筆　NT$ {incomeTotal.toLocaleString()}
              </div>
              {incomeItems.map((item,i)=><ItemRow key={`i${i}`} item={item}/>)}
            </>}
            {/* 應扣回明細 */}
            {clawItems.length>0&&<>
              <div style={{padding:"8px 18px",background:"#fef2f2",fontSize:11,fontWeight:700,color:"#ef4444",
                borderTop:"1.5px solid #fca5a5",borderBottom:"1px solid #fca5a5"}}>
                🔴 取消／扣回明細　{clawItems.length} 筆　NT$ {clawTotal.toLocaleString()}
              </div>
              {clawItems.map((item,i)=><ItemRow key={`c${i}`} item={item} isClaw={true}
                extraNote={item.isCancelNotPaid?"尚未支付，已取消":""}/>)}
            </>}
            {/* 合計 */}
            <div style={{padding:"12px 18px",background:"#f8fafc",borderTop:"2px solid #e2e8f0",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>本月實領合計</span>
              <span style={{fontWeight:900,fontSize:18,color:netTotal>=0?"#059669":"#ef4444"}}>
                NT$ {netTotal.toLocaleString()}
              </span>
              {alreadyClawedTotal>0&&incomeTotal>0&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>
                預計收入 NT${incomeTotal.toLocaleString()} ─ 已扣回 NT${alreadyClawedTotal.toLocaleString()} = NT${netTotal.toLocaleString()}
              </div>}
            </div>
          </div>
        }
      </div>
    );
  };

  // ── 系統設定（管理者專屬）───────────────────────────────────────
  // ── 營運報告（管理者專屬）───────────────────────────────────────
  const ReportView=()=>{
    const now=new Date();
    const [mode,setMode]=React.useState("month");
    const [selYear,setSelYear]=React.useState(now.getFullYear());
    const [selMonth,setSelMonth]=React.useState(now.getMonth()+1);
    const [chartStartYear,setChartStartYear]=React.useState(now.getFullYear()-1);
    const [chartEndYear,setChartEndYear]=React.useState(now.getFullYear());
    const years=[now.getFullYear()-3,now.getFullYear()-2,now.getFullYear()-1,now.getFullYear()];
    const months=Array.from({length:12},(_,i)=>i+1);

    const rate=exchangeRates[`${selYear}-${String(selMonth).padStart(2,"0")}`]||31;
    const pctFn=(usd)=>{if(usd<=3200)return 8;if(usd<=6500)return 12;return 15;};

    // 課程分類
    const classifyProgram=(prog)=>{
      const p=(prog||"").toLowerCase();
      if(p.includes("ielts")) return "IELTS";
      if(p.includes("toeic")) return "TOEIC";
      if(p.includes("toefl")) return "TOEFL";
      if(p.includes("business")) return "Business English";
      if(p.includes("summer")) return "Summer Camp";
      if(p.includes("winter")) return "Winter Camp";
      if(p.includes("family")) return "Family Program";
      if(p.includes("esl")||p.includes("power")) return "ESL";
      return "其他";
    };
    const PROG_COLORS={"ESL":"#6366f1","IELTS":"#059669","TOEIC":"#f59e0b","TOEFL":"#0284c7",
      "Business English":"#ec4899","Summer Camp":"#f97316","Winter Camp":"#8b5cf6","Family Program":"#10b981","其他":"#94a3b8"};

    // 年齡分組
    const ageGroup=(birthday,enrollDate)=>{
      if(!birthday||!enrollDate) return "未填";
      const age=Math.floor((new Date(enrollDate)-new Date(birthday))/(1000*60*60*24*365.25));
      if(age<18) return "未滿18";
      if(age<=30) return "18–30";
      if(age<=40) return "31–40";
      if(age<=50) return "41–50";
      return "50+";
    };
    const AGE_COLORS={"未滿18":"#f59e0b","18–30":"#6366f1","31–40":"#059669","41–50":"#0284c7","50+":"#ec4899","未填":"#94a3b8"};
    const AGE_GROUPS=["未滿18","18–30","31–40","41–50","50+","未填"];

    const inRange=(s)=>{
      if(!s.enrollDate) return false;
      const d=new Date(s.enrollDate);
      return mode==="year"?d.getFullYear()===selYear:(d.getFullYear()===selYear&&d.getMonth()+1===selMonth);
    };
    const inRangeConsult=(s)=>{
      const d=s.consultDate?new Date(s.consultDate):null;
      if(!d) return false;
      return mode==="year"?d.getFullYear()===selYear:(d.getFullYear()===selYear&&d.getMonth()+1===selMonth);
    };

    const allEnrolled=[...enrolledStudents,...closedStudents];
    const enrolledInRange=allEnrolled.filter(s=>inRange(s));
    // 轉換率分母：所有曾諮詢的學生（含已升級為正式報名＆結案的）
    const consultInRange=[...consultStudents,...enrolledStudents,...closedStudents].filter(s=>inRangeConsult(s));
    const cancelInRange=closedStudents.filter(s=>s.closeType==="cancelEnroll"&&inRange(s));
    const noContactInRange=closedStudents.filter(s=>s.closeType==="noContact"&&inRangeConsult(s));
    const notEnrollInRange=closedStudents.filter(s=>s.closeType==="notEnroll"&&inRangeConsult(s));

    const totalCommUSD=enrolledInRange.reduce((a,s)=>a+Number(s.commission||0),0);
    const totalCommTWD=Math.round(totalCommUSD*rate);
    const totalWeeks=enrolledInRange.reduce((a,s)=>a+Number(s.weeks||0),0);
    const totalBonusTWD=enrolledInRange.reduce((a,s)=>{
      const cTWD=Math.round(Number(s.commission||0)*rate);
      const cUSD=allEnrolled.filter(x=>x.consultant===s.consultant&&x.enrollDate&&
        x.enrollDate.slice(0,7)===s.enrollDate.slice(0,7)).reduce((x,y)=>x+Number(y.commission||0),0);
      return a+Math.round(cTWD*pctFn(cUSD)/100);
    },0);
    const netProfitTWD=totalCommTWD-totalBonusTWD;
    const conversionRate=consultInRange.length>0?Math.round(enrolledInRange.length/consultInRange.length*100):0;

    // 課程統計（週數）
    const progStats={};
    enrolledInRange.forEach(s=>{
      const cat=classifyProgram(s.program);
      if(!progStats[cat]) progStats[cat]={cat,weeks:0,count:0};
      progStats[cat].weeks+=Number(s.weeks||0);
      progStats[cat].count++;
    });
    const progList=Object.values(progStats).sort((a,b)=>b.weeks-a.weeks);
    const totalProgWeeks=progList.reduce((a,x)=>a+x.weeks,0);

    // 年齡統計
    const ageStats={};
    AGE_GROUPS.forEach(g=>{ageStats[g]={group:g,count:0};});
    enrolledInRange.forEach(s=>{
      const g=ageGroup(s.birthday,s.enrollDate);
      if(!ageStats[g]) ageStats[g]={group:g,count:0};
      ageStats[g].count++;
    });
    const ageList=AGE_GROUPS.map(g=>ageStats[g]||{group:g,count:0});
    const maxAge=Math.max(...ageList.map(x=>x.count),1);

    // 各校統計
    const schoolStats={};
    enrolledInRange.forEach(s=>{
      const k=s.school||"未填";
      if(!schoolStats[k]) schoolStats[k]={name:k,count:0,weeks:0,commUSD:0};
      schoolStats[k].count++;
      schoolStats[k].weeks+=Number(s.weeks||0);
      schoolStats[k].commUSD+=Number(s.commission||0);
    });
    const schoolList=Object.values(schoolStats).sort((a,b)=>b.count-a.count);

    // 顧問排名
    const consultantStats={};
    enrolledInRange.forEach(s=>{
      const k=s.consultant||"未指定";
      if(!consultantStats[k]) consultantStats[k]={name:k,count:0,weeks:0,commUSD:0,consultCount:0};
      consultantStats[k].count++;
      consultantStats[k].weeks+=Number(s.weeks||0);
      consultantStats[k].commUSD+=Number(s.commission||0);
    });
    consultInRange.forEach(s=>{
      const k=s.consultant||"未指定";
      if(!consultantStats[k]) consultantStats[k]={name:k,count:0,weeks:0,commUSD:0,consultCount:0};
      consultantStats[k].consultCount++;
    });
    const consultantList=Object.values(consultantStats)
      .map(c=>({...c,convRate:c.consultCount>0?Math.round(c.count/c.consultCount*100):0,
        commTWD:Math.round(c.commUSD*rate)}))
      .sort((a,b)=>b.commUSD-a.commUSD);

    // 成長圖資料（跨年月）
    const growthData=[];
    for(let y=chartStartYear;y<=chartEndYear;y++){
      for(let m=1;m<=12;m++){
        const students2=allEnrolled.filter(s=>{
          if(!s.enrollDate) return false;
          const d=new Date(s.enrollDate);
          return d.getFullYear()===y&&d.getMonth()+1===m;
        });
        const r2=exchangeRates[`${y}-${String(m).padStart(2,"0")}`]||31;
        const commUSD2=students2.reduce((a,s)=>a+Number(s.commission||0),0);
        const bonus2=students2.reduce((a,s)=>{
          const cTWD=Math.round(Number(s.commission||0)*r2);
          const cUSD=allEnrolled.filter(x=>x.consultant===s.consultant&&x.enrollDate&&
            x.enrollDate.slice(0,7)===s.enrollDate.slice(0,7)).reduce((x,yy)=>x+Number(yy.commission||0),0);
          return a+Math.round(cTWD*pctFn(cUSD)/100);
        },0);
        growthData.push({label:`${y}/${m}`,year:y,month:m,count:students2.length,
          weeks:students2.reduce((a,s)=>a+Number(s.weeks||0),0),
          commTWD:Math.round(commUSD2*r2),profit:Math.round(commUSD2*r2)-bonus2});
      }
    }
    const maxCount=Math.max(...growthData.map(x=>x.count),1);
    const maxProfit=Math.max(...growthData.map(x=>Math.abs(x.profit)),1);
    const maxCommTWD=Math.max(...growthData.map(x=>x.commTWD),1);

    // 月份報名統計（年報用）
    const monthlyData=months.map(m=>{
      const s2=allEnrolled.filter(s=>{
        if(!s.enrollDate) return false;
        const d=new Date(s.enrollDate);
        return d.getFullYear()===selYear&&d.getMonth()+1===m;
      });
      return {m,count:s2.length,weeks:s2.reduce((a,s)=>a+Number(s.weeks||0),0),
        commTWD:Math.round(s2.reduce((a,s)=>a+Number(s.commission||0),0)*rate)};
    });
    const maxMonthCount=Math.max(...monthlyData.map(x=>x.count),1);

    // CSV 匯出
    const [showExport,setShowExport]=React.useState(null); // null | "csv"

    const getCSVText=()=>{
      const rows=[
        ["期間",mode==="year"?`${selYear}年`:`${selYear}年${selMonth}月`],
        ["報名人數",enrolledInRange.length],["總週數",totalWeeks],
        ["佣金總額(USD)",totalCommUSD],["佣金總額(TWD)",totalCommTWD],
        ["顧問獎金(TWD)",totalBonusTWD],["淨利潤(TWD)",netProfitTWD],
        ["轉換率(%)",conversionRate],["取消報名",cancelInRange.length],
        ["不報名",notEnrollInRange.length],["聯繫不上",noContactInRange.length],
        [],["＝ 各校統計 ＝"],["學校","人數","週數","佣金USD"],
        ...schoolList.map(s=>[s.name,s.count,s.weeks,s.commUSD]),
        [],["＝ 課程統計 ＝"],["課程類別","週數","人數","比例(%)"],
        ...progList.map(p=>[p.cat,p.weeks,p.count,totalProgWeeks?Math.round(p.weeks/totalProgWeeks*100):0]),
        [],["＝ 顧問業績 ＝"],["顧問","報名數","週數","佣金USD","佣金TWD","諮詢數","轉換率%"],
        ...consultantList.map(c=>[c.name,c.count,c.weeks,c.commUSD,c.commTWD,c.consultCount,c.convRate]),
      ];
      return rows.map(r=>r.join("\t")).join("\n");
    };

    const Card=({label,val,sub,color="#0f172a"})=>(
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px 16px"}}>
        <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:4}}>{label}</div>
        <div style={{fontSize:20,fontWeight:900,color,lineHeight:1}}>{val}</div>
        {sub&&<div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{sub}</div>}
      </div>
    );

    // 圓餅圖（SVG）
    const PieChart=({data,size=160})=>{
      const total=data.reduce((a,x)=>a+x.value,0);
      if(!total) return <div style={{textAlign:"center",color:"#94a3b8",fontSize:12,padding:20}}>無資料</div>;
      let cum=0;
      const slices=data.map(d=>{
        const pct=d.value/total;
        const start=cum*2*Math.PI;
        cum+=pct;
        const end=cum*2*Math.PI;
        const r=size/2-4;
        const cx=size/2,cy=size/2;
        const x1=cx+r*Math.sin(start),y1=cy-r*Math.cos(start);
        const x2=cx+r*Math.sin(end),y2=cy-r*Math.cos(end);
        const large=pct>0.5?1:0;
        return {...d,path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`,pct};
      }).filter(d=>d.pct>0);
      return (
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={1.5}/>)}
          </svg>
          <div style={{flex:1,minWidth:120}}>
            {slices.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
                <span style={{fontSize:11,color:"#374151",flex:1}}>{s.label}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{Math.round(s.pct*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const periodLabel=mode==="year"?`${selYear}年`:`${selYear}年${selMonth}月`;
    const reportRef=React.useRef();

    return (
      <div ref={reportRef}>
        {/* 篩選列 + 匯出 */}
        <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {[["month","月報"],["year","年報"]].map(([v,lb])=>(
              <button key={v} onClick={()=>setMode(v)}
                style={{...btnS(mode===v?"#6366f1":"transparent",mode===v?"#fff":"#64748b"),
                  padding:"5px 16px",fontSize:13,borderRadius:7}}>
                {lb}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:9,padding:3}}>
            {years.map(y=>(
              <button key={y} onClick={()=>setSelYear(y)}
                style={{...btnS(selYear===y?"#fff":"transparent",selYear===y?"#0f172a":"#64748b"),
                  padding:"5px 12px",fontSize:12,borderRadius:7}}>
                {y}
              </button>
            ))}
          </div>
          {mode==="month"&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {months.map(m=>(
              <button key={m} onClick={()=>setSelMonth(m)}
                style={{...btnS(selMonth===m?"#6366f1":"#f1f5f9",selMonth===m?"#fff":"#475569"),
                  padding:"5px 9px",fontSize:12,minWidth:34}}>{m}月</button>
            ))}
          </div>}
          <span style={{fontWeight:700,color:"#0f172a",fontSize:13,marginLeft:4}}>📊 {periodLabel}</span>
          <div style={{marginLeft:"auto",display:"flex",gap:6}}>
            <button onClick={()=>{
              const txt=getCSVText();
              navigator.clipboard.writeText(txt).then(()=>setShowExport("copied")).catch(()=>setShowExport("csv"));
            }} style={{...btnS("#ecfdf5","#059669"),border:"1px solid #6ee7b7",padding:"6px 14px",fontSize:12}}>
              {showExport==="copied"?"✅ 已複製！":"📋 複製 CSV 資料"}
            </button>
            <button onClick={()=>setShowExport(showExport==="csv"?null:"csv")}
              style={{...btnS("#eef2ff","#6366f1"),border:"1px solid #c7d2fe",padding:"6px 14px",fontSize:12}}>
              📊 查看 CSV 文字
            </button>
          </div>
        </div>

        {/* CSV 展示 */}
        {showExport==="csv"&&(
          <div style={{background:"#1e293b",borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{color:"#a5f3fc",fontWeight:700,fontSize:13}}>📋 CSV 資料（全選後複製，貼入 Excel）</span>
              <button onClick={()=>{
                const txt=getCSVText();
                navigator.clipboard.writeText(txt).then(()=>setShowExport("copied")).catch(()=>{});
              }} style={btnS("#6366f1")}>複製全部</button>
            </div>
            <textarea readOnly value={getCSVText()}
              style={{width:"100%",height:200,background:"#0f172a",color:"#e2e8f0",
                border:"none",borderRadius:8,padding:"10px",fontSize:12,
                fontFamily:"monospace",resize:"vertical",outline:"none",boxSizing:"border-box"}}
              onClick={e=>e.target.select()}/>
            <div style={{fontSize:11,color:"#64748b",marginTop:6}}>
              💡 點擊文字框可全選，然後 Ctrl+C（Mac: ⌘+C）複製，貼入 Excel 或 Google 試算表即可。
            </div>
          </div>
        )}
        {showExport==="copied"&&(
          <div style={{background:"#ecfdf5",border:"1px solid #6ee7b7",borderRadius:10,
            padding:"10px 16px",marginBottom:14,fontSize:13,color:"#059669",fontWeight:700}}>
            ✅ 已複製到剪貼簿！請開啟 Excel 或 Google 試算表，按 Ctrl+V 貼上。
          </div>
        )}
        {/* 核心指標 */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
          <Card label="報名人數" val={`${enrolledInRange.length} 位`} sub="以報名日期計算"/>
          <Card label="完成遊學人數" val={`${enrolledInRange.length-cancelInRange.length} 位`} sub={`報名${enrolledInRange.length} − 取消${cancelInRange.length}`} color="#059669"/>
          <Card label="總報名週數" val={`${totalWeeks} 週`} sub={`均 ${enrolledInRange.length?Math.round(totalWeeks/enrolledInRange.length):0} 週/人`}/>
          <Card label="佣金總額" val={`USD $${totalCommUSD.toLocaleString()}`} sub={`NT$ ${totalCommTWD.toLocaleString()}`} color="#059669"/>
          <Card label="轉換率" val={`${conversionRate}%`} sub={`${consultInRange.length}諮詢→${enrolledInRange.length}報名`} color={conversionRate>=50?"#059669":"#f59e0b"}/>
          <Card label="顧問獎金支出" val={`NT$ ${totalBonusTWD.toLocaleString()}`} color="#6366f1"/>
          <Card label="佣金淨利潤" val={`NT$ ${netProfitTWD.toLocaleString()}`} color={netProfitTWD>=0?"#059669":"#ef4444"}/>
          <Card label="取消報名" val={`${cancelInRange.length} 位`} sub="已報名後取消" color="#f59e0b"/>
          <Card label="不報名" val={`${notEnrollInRange.length} 位`} sub="諮詢後未報名"/>
          <Card label="聯繫不上" val={`${noContactInRange.length} 位`} sub="無法聯繫結案"/>
        </div>

        {/* 年報：成長圖 + 月報名長條 */}
        {mode==="year"&&<>
          {/* 成長圖設定 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
              <span style={{fontWeight:800,color:"#0f172a",fontSize:14}}>📈 月成長趨勢圖</span>
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto",fontSize:12,color:"#64748b"}}>
                <span>顯示範圍：</span>
                <select value={chartStartYear} onChange={e=>setChartStartYear(Number(e.target.value))}
                  style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"3px 8px",fontSize:12,fontFamily:"inherit"}}>
                  {years.map(y=><option key={y} value={y}>{y}年</option>)}
                </select>
                <span>至</span>
                <select value={chartEndYear} onChange={e=>setChartEndYear(Number(e.target.value))}
                  style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"3px 8px",fontSize:12,fontFamily:"inherit"}}>
                  {years.map(y=><option key={y} value={y}>{y}年</option>)}
                </select>
              </div>
            </div>
            {/* 成長圖：報名人數 */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6366f1",marginBottom:8}}>報名人數</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:2,height:80,overflowX:"auto"}}>
                {growthData.map((d,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",minWidth:28}}>
                    <div style={{fontSize:9,color:"#94a3b8",marginBottom:2}}>{d.count||""}</div>
                    <div style={{width:20,background:d.year===selYear?"#6366f1":"#c7d2fe",borderRadius:"3px 3px 0 0",
                      height:`${Math.max(d.count/maxCount*60,d.count?2:0)}px`,transition:"height .3s"}}/>
                    <div style={{fontSize:8,color:"#94a3b8",marginTop:2,whiteSpace:"nowrap"}}>{d.month===1||i===0?d.year+"/":`${d.month}`}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 成長圖：佣金淨利潤 */}
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:8}}>佣金淨利潤（TWD）</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:2,height:80,overflowX:"auto"}}>
                {growthData.map((d,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",minWidth:28}}>
                    <div style={{fontSize:9,color:"#94a3b8",marginBottom:2}}>{d.profit>0?`${Math.round(d.profit/1000)}k`:""}</div>
                    <div style={{width:20,background:d.profit>=0?"#10b981":"#ef4444",borderRadius:"3px 3px 0 0",
                      height:`${Math.max(Math.abs(d.profit)/maxProfit*60,d.profit?2:0)}px`,transition:"height .3s"}}/>
                    <div style={{fontSize:8,color:"#94a3b8",marginTop:2}}>{d.month===1||i===0?d.year+"/":`${d.month}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 年報：月報名長條圖 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20,marginBottom:12}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>📅 {selYear}年 各月報名人數</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:100}}>
              {monthlyData.map(d=>(
                <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>{d.count||""}</div>
                  <div style={{width:"100%",background:"#6366f1",borderRadius:"4px 4px 0 0",
                    height:`${Math.max(d.count/maxMonthCount*70,d.count?3:0)}px`,
                    opacity:d.m===selMonth?1:0.5,transition:"height .3s"}}/>
                  <div style={{fontSize:10,color:"#64748b",marginTop:3}}>{d.m}月</div>
                </div>
              ))}
            </div>
          </div>

          {/* 年報：年齡長條圖 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20,marginBottom:12}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>👤 {selYear}年 報名學生年齡分佈</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:10,height:100}}>
              {ageList.map(d=>(
                <div key={d.group} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{d.count}</div>
                  <div style={{width:"100%",background:AGE_COLORS[d.group]||"#94a3b8",
                    borderRadius:"4px 4px 0 0",
                    height:`${Math.max(d.count/maxAge*70,d.count?3:0)}px`,transition:"height .3s"}}/>
                  <div style={{fontSize:10,color:"#64748b",marginTop:3,textAlign:"center",wordBreak:"break-word"}}>{d.group}</div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* 課程圓餅圖（月報和年報都有） */}
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20,marginBottom:12}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>
            📚 課程類別分佈（以週數計算）
          </div>
          {progList.length===0
            ?<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:20}}>此期間無報名資料</div>
            :<PieChart size={180} data={progList.map(p=>({
                label:`${p.cat}（${p.weeks}週）`,
                value:p.weeks,
                color:PROG_COLORS[p.cat]||"#94a3b8"
              }))}/>
          }
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          {/* 各校統計 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>🏫 各校報名統計</div>
            {schoolList.length===0
              ?<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:16}}>無資料</div>
              :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {schoolList.map((s,i)=>{
                  const pct=enrolledInRange.length?Math.round(s.count/enrolledInRange.length*100):0;
                  return (
                    <div key={s.name}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                        <span style={{fontWeight:700}}>#{i+1} {s.name}</span>
                        <span style={{color:"#64748b"}}>{s.count}人・{s.weeks}週・USD${s.commUSD.toLocaleString()}</span>
                      </div>
                      <div style={{background:"#f1f5f9",borderRadius:99,height:6}}>
                        <div style={{width:`${pct}%`,height:"100%",background:"#6366f1",borderRadius:99}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>

          {/* 流失分析 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>📉 諮詢流失分析</div>
            {[
              {label:"成功報名",count:enrolledInRange.length,color:"#059669"},
              {label:"取消報名",count:cancelInRange.length,color:"#f59e0b"},
              {label:"不報名",count:notEnrollInRange.length,color:"#ef4444"},
              {label:"聯繫不上",count:noContactInRange.length,color:"#64748b"},
            ].map(item=>{
              const total=enrolledInRange.length+cancelInRange.length+notEnrollInRange.length+noContactInRange.length;
              const pct=total?Math.round(item.count/total*100):0;
              return (
                <div key={item.label} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                    <span style={{fontWeight:700,color:item.color}}>{item.label}</span>
                    <span style={{color:"#64748b"}}>{item.count}人（{pct}%）</span>
                  </div>
                  <div style={{background:"#f1f5f9",borderRadius:99,height:6}}>
                    <div style={{width:`${pct}%`,height:"100%",background:item.color,borderRadius:99}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 顧問業績排名 */}
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:20}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>👥 顧問業績排名</div>
          {consultantList.length===0
            ?<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:16}}>無資料</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                <thead><tr>
                  {["排名","顧問","報名數","週數","佣金(USD)","佣金(TWD)","諮詢數","轉換率"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",fontSize:11,color:"#64748b",fontWeight:700,
                      textAlign:"left",borderBottom:"1px solid #e2e8f0",background:"#f8fafc",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {consultantList.map((c,i)=>(
                    <tr key={c.name}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8f9ff"}
                      onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,fontSize:15,
                        color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#cd7f32":"#64748b"}}>
                        {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                      </td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9"}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <Avatar name={c.name} size={26}/>
                          <span style={{fontWeight:700,fontSize:13}}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:700}}>{c.count}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9"}}>{c.weeks}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:700,color:"#059669"}}>USD ${c.commUSD.toLocaleString()}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",color:"#059669"}}>NT$ {c.commTWD.toLocaleString()}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",color:"#64748b"}}>{c.consultCount}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{background:"#f1f5f9",borderRadius:99,height:5,width:50}}>
                            <div style={{width:`${c.convRate}%`,height:"100%",
                              background:c.convRate>=50?"#10b981":"#f59e0b",borderRadius:99}}/>
                          </div>
                          <span style={{fontSize:12,fontWeight:700,color:c.convRate>=50?"#059669":"#f59e0b"}}>{c.convRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    );
  };

  const SettingsView=()=>{
    const [tab,setTab]=React.useState("bonus");
    const [editLvl,setEditLvl]=React.useState(null);
    const [lvlForm,setLvlForm]=React.useState({});
    const [editingFeeId,setEditingFeeId]=React.useState(null);
    const [editFeeAmt,setEditFeeAmt]=React.useState(0);
    const [editFeeDate,setEditFeeDate]=React.useState("");
    const inp4={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 11px",fontSize:13,
      fontFamily:"inherit",outline:"none",background:"#fff",width:"100%",boxSizing:"border-box"};

    // 角色權限設定（說明用）
    const rolePerms=[
      {role:"管理者",color:"#6366f1",bg:"#eef2ff",perms:["查看全部學生","查看全部業績","修改所有成員資料","系統設定","我的獎金明細"]},
      {role:"顧問",color:"#059669",bg:"#ecfdf5",perms:["查看自己的學生","查看自己的業績","修改個人資料","我的獎金明細"]},
      {role:"行政",color:"#f59e0b",bg:"#fffbeb",perms:["查看全部學生進度","新增成員（顧問/行政）","修改個人資料"]},
    ];

    return (
      <div>
        <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:9,padding:3,marginBottom:16,width:"fit-content"}}>
          {[["bonus","💰 分潤Level設定"],["roles","👥 角色權限說明"],["admin","⚙️ 兼職行政費"],["import","📥 批次匯入說明"]].map(([t,lb])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{...btnS(tab===t?"#fff":"transparent",tab===t?"#0f172a":"#64748b"),
                padding:"6px 16px",fontSize:13,boxShadow:tab===t?"0 1px 4px rgba(0,0,0,.1)":undefined,borderRadius:7}}>
              {lb}
            </button>
          ))}
        </div>

        {/* 分潤 Level 設定 */}
        {tab==="bonus"&&(
          <div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:12}}>
              分潤級距設定　<span style={{fontSize:12,fontWeight:400,color:"#64748b"}}>可設定新套用日期，歷史月份不受影響</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {bonusLevels.map(lvl=>(
                <div key={lvl.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                  {editLvl===lvl.id
                    ?<div style={{padding:16}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                          <div><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>級距名稱</label>
                            <input value={lvlForm.label} onChange={e=>setLvlForm(p=>({...p,label:e.target.value}))} style={inp4}/></div>
                          <div><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>最低佣金(USD)</label>
                            <input type="number" value={lvlForm.minUSD} onChange={e=>setLvlForm(p=>({...p,minUSD:Number(e.target.value)}))} style={inp4}/></div>
                          <div><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>最高佣金(USD)</label>
                            <input type="number" value={lvlForm.maxUSD||""} onChange={e=>setLvlForm(p=>({...p,maxUSD:e.target.value?Number(e.target.value):null}))} placeholder="無上限" style={inp4}/></div>
                          <div><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>分潤% </label>
                            <input type="number" min="1" max="100" value={lvlForm.pct} onChange={e=>setLvlForm(p=>({...p,pct:Number(e.target.value)}))} style={inp4}/></div>
                          <div><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>📅 套用起始日</label>
                            <input type="date" value={lvlForm.effectiveDate} onChange={e=>setLvlForm(p=>({...p,effectiveDate:e.target.value}))} style={inp4}/></div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{setBonusLevels(prev=>prev.map(l=>l.id===lvl.id?{...l,...lvlForm}:l));setEditLvl(null);}}
                            style={btnS("#6366f1")}>💾 儲存</button>
                          <button onClick={()=>setEditLvl(null)} style={btnS("#f1f5f9","#475569")}>取消</button>
                        </div>
                      </div>
                    :<div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px"}}>
                        <span style={{background:"#eef2ff",color:"#6366f1",borderRadius:99,padding:"3px 12px",
                          fontSize:12,fontWeight:800,minWidth:70,textAlign:"center"}}>{lvl.label}</span>
                        <div style={{flex:1,fontSize:13,color:"#0f172a"}}>
                          USD ${lvl.minUSD.toLocaleString()} ～ {lvl.maxUSD?`$${lvl.maxUSD.toLocaleString()}`:"以上"}
                        </div>
                        <span style={{fontWeight:800,color:"#059669",fontSize:16}}>{lvl.pct}%</span>
                        <span style={{fontSize:11,color:"#94a3b8"}}>套用自 {lvl.effectiveDate}</span>
                        <button onClick={()=>{setLvlForm({...lvl});setEditLvl(lvl.id);}}
                          style={{...btnS("#eef2ff","#6366f1"),padding:"5px 12px",fontSize:12,border:"1px solid #c7d2fe"}}>✏️ 修改</button>
                      </div>
                  }
                </div>
              ))}
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 14px",
              marginTop:12,fontSize:12,color:"#92400e"}}>
              💡 修改分潤設定後，業績頁面會自動依各月份套用對應的分潤比率。歷史月份的已確認獎金不受影響。
            </div>
          </div>
        )}

        {/* 角色權限說明 */}
        {tab==="roles"&&(
          <div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:12}}>角色權限總覽</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {rolePerms.map(r=>(
                <div key={r.role} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{background:r.bg,color:r.color,border:`1px solid ${r.color}30`,
                      borderRadius:99,padding:"3px 14px",fontSize:13,fontWeight:800}}>{r.role}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {r.perms.map(p=>(
                      <span key={p} style={{background:"#f8fafc",border:"1px solid #e2e8f0",
                        borderRadius:7,padding:"4px 10px",fontSize:12,color:"#374151"}}>✅ {p}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:10,
              padding:"10px 14px",marginTop:12,fontSize:12,color:"#4338ca"}}>
              💡 角色指派請至「顧問資訊」頁面修改個別成員的角色設定。
            </div>
          </div>
        )}

        {/* 批次匯入說明 */}
        {tab==="admin"&&(
          <div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:12}}>兼職顧問行政費設定</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
              以下行政費將在兼職顧問<strong>第一階段獎金</strong>發放時自動扣除。可修改金額並設定生效日期。
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {adminFeeSettings.map(item=>(
                <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                  {editingFeeId!==item.id
                    ?<div style={{padding:"14px 18px"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div>
                            <span style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>{item.label}</span>
                            <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>生效自 {item.effectiveDate}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontWeight:900,color:"#ef4444",fontSize:16}}>NT$ {item.amount.toLocaleString()}</span>
                            <button onClick={()=>{setEditFeeAmt(item.amount);setEditFeeDate(item.effectiveDate);setEditingFeeId(item.id);}}
                              style={{...btnS("#eef2ff","#6366f1"),padding:"5px 12px",fontSize:12,border:"1px solid #c7d2fe"}}>
                              ✏️ 修改
                            </button>
                          </div>
                        </div>
                        <div style={{fontSize:12,color:"#64748b"}}>{item.desc}</div>
                      </div>
                    :<div style={{padding:"16px 18px",background:"#f8fafc"}}>
                        <div style={{fontWeight:700,color:"#6366f1",fontSize:13,marginBottom:10}}>修改 {item.label}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                          <div>
                            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>行政費金額（NT$）</label>
                            <input type="number" min="0" value={editFeeAmt} onChange={e=>setEditFeeAmt(Number(e.target.value))} style={inp4}/>
                          </div>
                          <div>
                            <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>📅 生效日期</label>
                            <input type="date" value={editFeeDate} onChange={e=>setEditFeeDate(e.target.value)} style={inp4}/>
                          </div>
                        </div>
                        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,
                          padding:"7px 12px",fontSize:12,color:"#92400e",marginBottom:10}}>
                          💡 修改後，生效日期當日起新報名的學生適用新費率。歷史報名不受影響。
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{
                            setAdminFeeSettings(prev=>prev.map(x=>x.id===item.id?{...x,amount:editFeeAmt,effectiveDate:editFeeDate}:x));
                            setEditingFeeId(null);
                          }} style={btnS("#6366f1")}>💾 儲存</button>
                          <button onClick={()=>setEditingFeeId(null)} style={btnS("#f1f5f9","#475569")}>取消</button>
                        </div>
                      </div>
                  }
                </div>
              ))}
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,
              padding:"10px 14px",marginTop:14,fontSize:12,color:"#92400e"}}>
              💡 郵寄費由行政人員在每月應發獎金頁面輸入實際費用，系統自動從第一階段獎金中扣除。
            </div>
          </div>
        )}
                {tab==="import"&&(
          <div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:12}}>Google 試算表批次匯入說明</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[
                {title:"📚 學校資料庫匯入格式",color:"#6366f1",bg:"#eef2ff",
                  cols:["學校名稱","課程1","課程2","課程3","課程4","課程5","課程6","房型1","房型2","房型3","房型4","房型5","房型6"],
                  note:"課程和房型欄位可留空，系統會自動忽略空白欄位。每行為一所學校。"},
                {title:"👤 顧問資料匯入格式",color:"#059669",bg:"#ecfdf5",
                  cols:["姓名","角色（manager/consultant/admin）","Email","電話","到職日期（YYYY-MM-DD）","在職狀態"],
                  note:"角色欄位請填入英文小寫：manager、consultant、admin。Email為登入帳號，預設密碼為123456。"},
              ].map(sec=>(
                <div key={sec.title} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"18px 20px"}}>
                  <div style={{fontWeight:800,color:sec.color,fontSize:14,marginBottom:10}}>{sec.title}</div>
                  <div style={{background:sec.bg,borderRadius:8,padding:"10px 14px",marginBottom:10,overflowX:"auto"}}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {sec.cols.map((c,i)=>(
                        <span key={i} style={{background:"#fff",border:`1px solid ${sec.color}30`,
                          borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700,color:sec.color,whiteSpace:"nowrap"}}>
                          {String.fromCharCode(65+i)}欄：{c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>⚠️ {sec.note}</div>
                  <div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",fontSize:12,color:"#374151",lineHeight:1.8}}>
                    <strong>📋 匯入步驟：</strong><br/>
                    1. 開啟 Google 試算表，依上方格式建立資料<br/>
                    2. 選取所有資料列（含欄位標題）→ 複製<br/>
                    3. 點選下方「貼上試算表資料」按鈕，貼入複製的內容<br/>
                    4. 系統自動解析並預覽，確認後按「確認匯入」
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,
              padding:"12px 16px",marginTop:14,fontSize:12,color:"#92400e"}}>
              💡 <strong>公版 Google 試算表範本：</strong>請複製以下連結至瀏覽器開啟，然後點選「建立副本」即可使用。<br/>
              <span style={{fontFamily:"monospace",color:"#6366f1",wordBreak:"break-all"}}>
                https://docs.google.com/spreadsheets/d/1TCTaW8QawlHrZdkjilZiGuj027bF6MjqFjhXfGMdvC0/copy
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Google試算表資料解析匯入功能（用於SchoolDB和Members頁面）
  const parseSheetData=(text,type)=>{
    const rows=text.trim().split("\n").map(r=>r.split("\t"));
    if(rows.length<2) return [];
    if(type==="school"){
      const header=rows[0];
      // 標題列動態偵測：找到第一個「房型」欄的位置
      let roomStartIdx=header.findIndex(h=>(h||"").trim().startsWith("房型"));
      if(roomStartIdx<0){
        // 沒有標題列，用預設：A欄學校，剩下自動分一半
        roomStartIdx=Math.ceil(header.length/2);
      }
      const data=rows.slice(1); // 跳過標題
      return data.filter(r=>r[0]?.trim()).map(r=>({
        id:Date.now()+Math.random(),
        name:r[0]?.trim()||"",
        programs:r.slice(1,roomStartIdx).map(x=>x?.trim()).filter(Boolean),
        rooms:r.slice(roomStartIdx).map(x=>x?.trim()).filter(Boolean),
      }));
    }
    if(type==="member"){
      const data=rows.slice(1);
      return data.filter(r=>r[0]?.trim()).map(r=>({
        id:Date.now()+Math.random(),
        name:r[0]?.trim()||"",
        role:["manager","consultant","admin"].includes(r[1]?.trim())?r[1].trim():"consultant",
        email:r[2]?.trim()||"",
        phone:r[3]?.trim()||"",
        startDate:r[4]?.trim()||"",
        status:r[5]?.trim()||"正職",
        emergencyName:"",emergencyPhone:"",address:"",note:"",
        probationTarget:5,probationEnd:"",
      }));
    }
    return [];
  };

  // ── 學校資料庫 ──────────────────────────────────────────────────
  const SchoolDBView=()=>{
    const [editId,setEditId]=React.useState(null);
    const [showAdd,setShowAdd]=React.useState(false);
    const [showImport,setShowImport]=React.useState(false);
    const [importText,setImportText]=React.useState("");
    const [importPreview,setImportPreview]=React.useState([]);
    const [form,setForm]=React.useState({name:"",programs:["","","","","",""],rooms:["","","","","",""]});

    const resetForm=()=>setForm({name:"",programs:["","","","","",""],rooms:["","","","","",""]});
    const startEdit=(school)=>{
      const progs=[...school.programs,...Array(Math.max(0,6-school.programs.length)).fill("")];
      const rms=[...school.rooms,...Array(Math.max(0,6-school.rooms.length)).fill("")];
      setForm({name:school.name,programs:progs,rooms:rms});
      setEditId(school.id); setShowAdd(false);
    };
    const saveEdit=()=>{
      setSchoolDB(prev=>prev.map(s=>s.id===editId?{...s,...form,
        programs:form.programs.filter(p=>p.trim()),
        rooms:form.rooms.filter(r=>r.trim())}:s));
      setEditId(null);
    };
    const saveAdd=()=>{
      if(!form.name.trim()) return;
      setSchoolDB(prev=>[...prev,{id:Date.now(),name:form.name,
        programs:form.programs.filter(p=>p.trim()),
        rooms:form.rooms.filter(r=>r.trim())}]);
      setShowAdd(false); resetForm();
    };
    const deleteSchool=(id)=>setSchoolDB(prev=>prev.filter(s=>s.id!==id));

    const FieldList=({label,vals,key2,onChange,onAdd})=>(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700}}>{label}</label>
          <button onClick={onAdd} style={{...btnS("#eef2ff","#6366f1"),padding:"2px 10px",fontSize:11,border:"1px solid #c7d2fe"}}>＋ 新增</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {vals.map((v,i)=>(
            <div key={i} style={{display:"flex",gap:4}}>
              <input value={v} onChange={e=>onChange(i,e.target.value)}
                placeholder={`${label.replace(" *","")} ${i+1}`}
                style={{...inp(),padding:"6px 10px",fontSize:12,flex:1}}/>
              {i>=6&&<button onClick={()=>onChange(i,null)}
                style={{background:"transparent",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14,padding:"0 4px"}}>✕</button>}
            </div>
          ))}
        </div>
      </div>
    );

    const SchoolForm=({onSave,onCancel,saveLabel})=>(
      <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:18,marginBottom:14}}>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:4}}>學校名稱 *</label>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
            placeholder="例：We Academy" style={{...inp(),maxWidth:320}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
          <FieldList label="課程" vals={form.programs}
            onChange={(i,v)=>setForm(p=>({...p,programs:v===null?p.programs.filter((_,j)=>j!==i):p.programs.map((x,j)=>j===i?v:x)}))}
            onAdd={()=>setForm(p=>({...p,programs:[...p.programs,""]}))}/>
          <FieldList label="房型" vals={form.rooms}
            onChange={(i,v)=>setForm(p=>({...p,rooms:v===null?p.rooms.filter((_,j)=>j!==i):p.rooms.map((x,j)=>j===i?v:x)}))}
            onAdd={()=>setForm(p=>({...p,rooms:[...p.rooms,""]}))}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSave} style={btnS("#059669")}>{saveLabel}</button>
          <button onClick={onCancel} style={btnS("#f1f5f9","#475569")}>取消</button>
        </div>
      </div>
    );

    const [searchName,setSearchName]=React.useState("");
    const [searchProgram,setSearchProgram]=React.useState("");
    const [perPage,setPerPage]=React.useState(10);
    const [page,setPage]=React.useState(1);

    const filtered=schoolDB.filter(s=>{
      const nm=searchName.trim().toLowerCase();
      const pg=searchProgram.trim().toLowerCase();
      if(nm&&!s.name.toLowerCase().includes(nm)) return false;
      if(pg&&!s.programs.some(p=>p.toLowerCase().includes(pg))) return false;
      return true;
    });
    const totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
    const paged=filtered.slice((page-1)*perPage,page*perPage);
    const sinp2={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:13,
      fontFamily:"inherit",outline:"none",background:"#fff",color:"#0f172a",boxSizing:"border-box"};

    return (
      <div>
        {/* 搜尋列 + 新增按鈕 */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 180px",minWidth:160}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#94a3b8"}}>🔍</span>
            <input value={searchName} onChange={e=>{setSearchName(e.target.value);setPage(1);}}
              placeholder="學校名稱搜尋..."
              style={{...sinp2,paddingLeft:32,width:"100%"}}/>
          </div>
          <div style={{position:"relative",flex:"1 1 180px",minWidth:160}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#94a3b8"}}>📚</span>
            <input value={searchProgram} onChange={e=>{setSearchProgram(e.target.value);setPage(1);}}
              placeholder="課程名稱搜尋..."
              style={{...sinp2,paddingLeft:32,width:"100%"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:12,color:"#64748b",whiteSpace:"nowrap"}}>每頁顯示</span>
            <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1);}}
              style={{...sinp2,width:70}}>
              {[5,10,20,50].map(n=><option key={n} value={n}>{n} 筆</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>setShowImport(p=>!p)}
              style={{...btnS("#eef2ff","#6366f1"),border:"1px solid #c7d2fe",padding:"7px 14px",fontSize:13}}>
              📥 試算表匯入
            </button>
            <button onClick={()=>{setShowAdd(true);setEditId(null);resetForm();}} style={btnS("#059669")}>＋ 新增學校</button>
          </div>
        </div>

        {/* 搜尋結果提示 */}
        <div style={{fontSize:13,color:"#64748b",marginBottom:10}}>
          {(searchName||searchProgram)
            ?<>搜尋結果：<strong>{filtered.length}</strong> 所
              {searchName&&<span>　學校名稱含「<strong style={{color:"#6366f1"}}>{searchName}</strong>」</span>}
              {searchProgram&&<span>　課程含「<strong style={{color:"#059669"}}>{searchProgram}</strong>」</span>}
            </>
            :<>共 <strong>{schoolDB.length}</strong> 所學校</>
          }
        </div>

        {showImport&&(
          <div style={{background:"#f8fafc",border:"1.5px solid #c7d2fe",borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontWeight:700,color:"#6366f1",fontSize:13,marginBottom:8}}>📥 從 Google 試算表貼上資料</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>請至試算表選取資料（含標題列）→ 複製 → 貼入下方</div>
            <textarea value={importText} onChange={e=>{
              setImportText(e.target.value);
              setImportPreview(parseSheetData(e.target.value,"school"));
            }} placeholder="在此貼上試算表內容..."
              style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:12,
                fontFamily:"monospace",outline:"none",width:"100%",height:100,resize:"vertical",
                boxSizing:"border-box",marginBottom:10}}/>
            {importPreview.length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:6}}>
                  預覽 {importPreview.length} 所學校：
                </div>
                {importPreview.map((s,i)=>(
                  <div key={i} style={{fontSize:11,color:"#374151",padding:"4px 8px",
                    background:"#fff",borderRadius:6,marginBottom:4,border:"1px solid #e2e8f0"}}>
                    <strong>{s.name}</strong>　課程：{s.programs.join("、")||"無"}　房型：{s.rooms.join("、")||"無"}
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(importPreview.length===0) return;
                setSchoolDB(prev=>[...prev,...importPreview]);
                setShowImport(false);setImportText("");setImportPreview([]);
              }} style={btnS("#059669")} disabled={importPreview.length===0}>
                ✅ 確認匯入 {importPreview.length>0?`(${importPreview.length}所)`:""}
              </button>
              <button onClick={()=>{setShowImport(false);setImportText("");setImportPreview([]);}}
                style={btnS("#f1f5f9","#475569")}>取消</button>
            </div>
          </div>
        )}
        {showAdd&&<SchoolForm onSave={saveAdd} onCancel={()=>setShowAdd(false)} saveLabel="✅ 確定新增"/>}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {paged.length===0
            ?<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:14}}>找不到符合條件的學校</div>
            :paged.map(school=>(
              <div key={school.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                {editId===school.id
                  ?<div style={{padding:18}}><SchoolForm onSave={saveEdit} onCancel={()=>setEditId(null)} saveLabel="💾 儲存修改"/></div>
                  :<div style={{padding:"14px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>🏫 {school.name}</div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>startEdit(school)} style={{...btnS("#eef2ff","#6366f1"),padding:"5px 12px",fontSize:12,border:"1px solid #c7d2fe"}}>✏️ 編輯</button>
                        <button onClick={()=>{if(window.confirm(`確定刪除「${school.name}」？`))deleteSchool(school.id);}}
                          style={{...btnS("#fef2f2","#ef4444"),padding:"5px 12px",fontSize:12,border:"1px solid #fca5a5"}}>🗑 刪除</button>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6}}>課程（{school.programs.length}）</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {school.programs.map((p,i)=>{
                            const match=searchProgram&&p.toLowerCase().includes(searchProgram.toLowerCase());
                            return <span key={i} style={{background:match?"#fef9c3":"#eef2ff",color:match?"#92400e":"#6366f1",
                              border:`1px solid ${match?"#fde68a":"#c7d2fe"}`,
                              borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>{p}</span>;
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6}}>房型（{school.rooms.length}）</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {school.rooms.map((r,i)=>(
                            <span key={i} style={{background:"#f0fdf4",color:"#059669",border:"1px solid #6ee7b7",
                              borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>{r}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            ))
          }
        </div>

        {/* 分頁 */}
        {totalPages>1&&(
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginTop:16}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              style={{...btnS("#f1f5f9","#475569"),padding:"5px 14px",fontSize:13,opacity:page===1?.4:1}}>← 上一頁</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
              <button key={n} onClick={()=>setPage(n)}
                style={{...btnS(page===n?"#6366f1":"#f1f5f9",page===n?"#fff":"#475569"),
                  padding:"5px 12px",fontSize:13,minWidth:36}}>
                {n}
              </button>
            ))}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              style={{...btnS("#f1f5f9","#475569"),padding:"5px 14px",fontSize:13,opacity:page===totalPages?.4:1}}>下一頁 →</button>
          </div>
        )}
        <div style={{textAlign:"center",fontSize:12,color:"#94a3b8",marginTop:8}}>
          第 {page} 頁，共 {totalPages} 頁　顯示第 {(page-1)*perPage+1}–{Math.min(page*perPage,filtered.length)} 筆
        </div>
      </div>
    );
  };

  // ── 顧問資料 ─────────────────────────────────────────────────────
  const MembersView=()=>{
    const [editId,setEditId]=React.useState(null);
    const [showAdd,setShowAdd]=React.useState(false);
    const emptyForm={name:"",role:"consultant",email:"",phone:"",emergencyName:"",emergencyPhone:"",address:"",note:"",startDate:"",endDate:"",status:"試用期",probationTarget:5,probationEnd:"",employmentType:"fulltime"};
    const [form,setForm]=React.useState(emptyForm);
    const f=(k,v)=>setForm(p=>({...p,[k]:v}));
    const roleLabel={manager:"管理者",consultant:"顧問",admin:"行政"};
    const roleColor={manager:"#6366f1",consultant:"#059669",admin:"#f59e0b"};
    const roleBg={manager:"#eef2ff",consultant:"#ecfdf5",admin:"#fffbeb"};
    const isManager=currentRole==="manager";
    // 當前使用者的 id
    const myRecord=consultantDB.find(m=>m.name===currentUser);

    const saveAdd=()=>{
      if(!form.name.trim()) return;
      setConsultantDB(prev=>[...prev,{...form,id:Date.now()}]);
      setShowAdd(false); setForm(emptyForm);
    };
    const saveEdit=()=>{
      setConsultantDB(prev=>prev.map(m=>m.id===editId?{...m,...form}:m));
      setEditId(null);
    };
    // 試用期達標通知檢查
    React.useEffect(()=>{
      consultantDB.forEach(m=>{
        if(m.status!=="試用期") return;
        const prog=getProbationProgress(m);
        if(!prog) return;
        if(prog.count>=prog.target){
          const key=`probation_done_${m.id}`;
          const already=notifications.find(n=>n.key===key);
          if(!already){
            setNotifications(prev=>[...prev,{
              key,id:Date.now(),
              type:"probation",
              msg:`🎉 ${m.name} 在試用期內已達成 ${prog.target} 人報名目標！請確認是否轉正職。`,
              time:new Date().toLocaleDateString("zh-TW"),
              read:false,
            }]);
          }
        }
      });
    },[consultantDB,enrolledStudents,closedStudents]);
    const startEdit=(m,selfOnly=false)=>{
      setForm({name:m.name,role:m.role,email:m.email||"",phone:m.phone||"",
        emergencyName:m.emergencyName||"",emergencyPhone:m.emergencyPhone||"",
        address:m.address||"",note:m.note||"",
        startDate:m.startDate||"",endDate:m.endDate||"",
        status:m.status||"正職",probationTarget:m.probationTarget||5,probationEnd:m.probationEnd||"",
        employmentType:m.employmentType||"fulltime"});
      setEditId(m.id); setShowAdd(false);
    };

    const inp2={...inp(),padding:"7px 11px",fontSize:13};
    const Label=({t})=><label style={{fontSize:11,color:"#64748b",fontWeight:700,display:"block",marginBottom:3}}>{t}</label>;
    const ReadOnly=({val})=><div style={{...inp2,background:"#f8fafc",color:"#64748b",cursor:"default",borderStyle:"dashed"}}>{val||"—"}</div>;
    const calcProbEnd=(startDate)=>{
      if(!startDate) return "";
      const d=new Date(startDate);
      d.setMonth(d.getMonth()+3);
      return d.toISOString().split("T")[0];
    };
    const STATUS_LIST=["試用期","正職","兼職","留職停薪","離職"];
    const STATUS_COLOR={試用期:"#f59e0b",正職:"#10b981",兼職:"#6366f1",留職停薪:"#64748b",離職:"#ef4444"};
    const STATUS_BG={試用期:"#fffbeb",正職:"#ecfdf5",兼職:"#eef2ff",留職停薪:"#f1f5f9",離職:"#fef2f2"};

    // 計算試用期進度
    const getProbationProgress=(m)=>{
      if(m.status!=="試用期") return null;
      const count=[...enrolledStudents,...closedStudents].filter(s=>
        s.consultant===m.name&&s.enrollDate&&
        (!m.startDate||s.enrollDate>=m.startDate)&&
        (!m.probationEnd||s.enrollDate<=m.probationEnd)
      ).length;
      const target=m.probationTarget||5;
      return {count,target,pct:Math.min(100,Math.round(count/target*100))};
    };

    // 管理者表單（可改所有欄位）
    // ── 管理者表單 JSX（直接 inline 避免 re-mount 失焦問題）
    const managerFormJSX=(onSave,onCancel,label)=>(
      <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:16,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#6366f1",marginBottom:10}}>管理者編輯模式（可修改所有欄位）</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><Label t="姓名 *"/><input value={form.name} onChange={e=>f("name",e.target.value)} style={inp2}/></div>
          <div><Label t="角色"/>
            <select value={form.role} onChange={e=>f("role",e.target.value)} style={inp2}>
              {isManager&&<option value="manager">管理者</option>}
              <option value="consultant">顧問</option>
              <option value="admin">行政</option>
            </select>
          </div>
          <div><Label t="Email"/><input value={form.email} onChange={e=>f("email",e.target.value)} style={inp2}/></div>
          <div><Label t="電話"/><input value={form.phone} onChange={e=>f("phone",e.target.value)} style={inp2}/></div>
          <div><Label t="緊急聯絡人姓名"/><input value={form.emergencyName} onChange={e=>f("emergencyName",e.target.value)} style={inp2}/></div>
          <div><Label t="緊急聯絡人電話"/><input value={form.emergencyPhone} onChange={e=>f("emergencyPhone",e.target.value)} style={inp2}/></div>
          <div style={{gridColumn:"1/-1"}}><Label t="通訊地址"/><input value={form.address} onChange={e=>f("address",e.target.value)} style={inp2}/></div>
          <div><Label t="📅 到職日期"/><input type="date" value={form.startDate} onChange={e=>{
            const v=e.target.value; f("startDate",v);
            if(form.status==="試用期") f("probationEnd",calcProbEnd(v));
          }} style={inp2}/></div>
          <div><Label t="📅 離職日期"/><input type="date" value={form.endDate} onChange={e=>f("endDate",e.target.value)} style={{...inp2,borderColor:form.endDate?"#fca5a5":"#e2e8f0"}}/></div>
          <div><Label t="在職狀態"/>
            <select value={form.status||"正職"} onChange={e=>{
              const v=e.target.value; f("status",v);
              if(v==="試用期") f("probationEnd",calcProbEnd(form.startDate));
              else f("probationEnd","");
            }} style={inp2}>
              {["試用期","正職","兼職","留職停薪","離職"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label t="雇用類型"/>
            <select value={form.employmentType||"fulltime"} onChange={e=>f("employmentType",e.target.value)} style={inp2}>
              <option value="fulltime">全職（固定薪資）</option>
              <option value="parttime">兼職（純分潤制）</option>
            </select>
          </div>
          {form.status==="試用期"&&<>
            <div><Label t="試用期結束日（自動計算）"/><ReadOnly val={form.probationEnd||calcProbEnd(form.startDate)||"—"}/></div>
            <div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px"}}>
              <Label t="試用期通過標準"/>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                <span style={{fontSize:13,color:"#92400e"}}>試用期間擔任顧問，學生報名人數達</span>
                <input type="number" min="1" value={form.probationTarget||5}
                  onChange={e=>f("probationTarget",Number(e.target.value))}
                  style={{...inp2,width:70,textAlign:"center"}}/>
                <span style={{fontSize:13,color:"#92400e"}}>人，即可通過試用期</span>
              </div>
            </div>
          </>}
          <div style={{gridColumn:"1/-1"}}><Label t="備註"/><textarea value={form.note} onChange={e=>f("note",e.target.value)} style={{...inp2,height:52,resize:"vertical"}}/></div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSave} style={btnS("#6366f1")}>{label}</button>
          <button onClick={onCancel} style={btnS("#f1f5f9","#475569")}>取消</button>
        </div>
      </div>
    );

    const selfFormJSX=(onSave,onCancel)=>(
      <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:10,padding:16,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:10}}>✏️ 編輯個人資料</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><Label t="姓名（不可修改）"/><ReadOnly val={form.name}/></div>
          <div><Label t="角色（不可修改）"/><ReadOnly val={roleLabel[form.role]}/></div>
          <div><Label t="Email"/><input value={form.email} onChange={e=>f("email",e.target.value)} style={inp2}/></div>
          <div><Label t="電話"/><input value={form.phone} onChange={e=>f("phone",e.target.value)} style={inp2}/></div>
          <div><Label t="緊急聯絡人姓名"/><input value={form.emergencyName} onChange={e=>f("emergencyName",e.target.value)} style={inp2}/></div>
          <div><Label t="緊急聯絡人電話"/><input value={form.emergencyPhone} onChange={e=>f("emergencyPhone",e.target.value)} style={inp2}/></div>
          <div style={{gridColumn:"1/-1"}}><Label t="通訊地址"/><input value={form.address} onChange={e=>f("address",e.target.value)} style={inp2}/></div>
          <div><Label t="📅 到職日期（不可修改）"/><ReadOnly val={form.startDate||"—"}/></div>
          <div><Label t="📅 離職日期（不可修改）"/><ReadOnly val={form.endDate||"未離職"}/></div>
          <div><Label t="在職狀態（不可修改）"/><ReadOnly val={form.status||"正職"}/></div>
          {form.status==="試用期"&&<div style={{gridColumn:"1/-1"}}><Label t="試用期間"/><ReadOnly val={`${form.startDate||"—"} ～ ${form.probationEnd||calcProbEnd(form.startDate)||"—"}`}/></div>}
          <div style={{gridColumn:"1/-1"}}><Label t="備註"/><textarea value={form.note} onChange={e=>f("note",e.target.value)} style={{...inp2,height:52,resize:"vertical"}}/></div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSave} style={btnS("#059669")}>💾 儲存個人資料</button>
          <button onClick={onCancel} style={btnS("#f1f5f9","#475569")}>取消</button>
        </div>
      </div>
    );

    return (
      <div>
        {/* 試用期達標通知 */}
        {notifications.filter(n=>n.type==="probation"&&!n.read).map(n=>(
          <div key={n.key} style={{background:"#ecfdf5",border:"1.5px solid #6ee7b7",borderRadius:10,
            padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🎉</span>
            <span style={{flex:1,fontSize:13,fontWeight:600,color:"#065f46"}}>{n.msg}</span>
            <button onClick={()=>setNotifications(prev=>prev.map(x=>x.key===n.key?{...x,read:true}:x))}
              style={{background:"transparent",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:18,padding:0}}>✕</button>
          </div>
        ))}
        {/* 角色切換（模擬） */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px 18px",marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:10}}>目前登入身份（模擬切換）</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {consultantDB.map(m=>(
              <button key={m.id} onClick={()=>{setCurrentRole(m.role);setCurrentUser(m.name);setEditId(null);}}
                style={{display:"flex",alignItems:"center",gap:7,padding:"7px 14px",borderRadius:9,
                  border:currentUser===m.name?"2px solid "+roleColor[m.role]:"1.5px solid #e2e8f0",
                  background:currentUser===m.name?roleBg[m.role]:"#fff",
                  cursor:"pointer",fontFamily:"inherit"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:roleColor[m.role]}}/>
                <span style={{fontSize:13,fontWeight:700,color:currentUser===m.name?roleColor[m.role]:"#374151"}}>{m.name}</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>{roleLabel[m.role]}</span>
              </button>
            ))}
          </div>
          <div style={{marginTop:10,fontSize:12,color:"#64748b",background:"#f8fafc",borderRadius:7,padding:"7px 11px"}}>
            <strong>{currentUser}</strong>（{roleLabel[currentRole]}）
            {currentRole==="manager"&&" — 可查看所有顧問業績與學生資料，可修改所有成員資料"}
            {currentRole==="consultant"&&" — 只能查看自己的學生與業績，可修改個人聯絡資料"}
            {currentRole==="admin"&&" — 可查看所有學生資料，可新增成員，可修改個人聯絡資料"}
          </div>
        </div>

        {/* 成員列表 */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:14,color:"#64748b"}}>共 <strong>{consultantDB.length}</strong> 位成員</div>
          {(isManager||currentRole==="admin")&&
            <button onClick={()=>{setShowAdd(true);setEditId(null);setForm(emptyForm);}} style={btnS("#6366f1")}>＋ 新增成員</button>}
        </div>
        {showAdd&&managerFormJSX(saveAdd,()=>setShowAdd(false),"＋ 新增成員")}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {consultantDB.filter(m=>{
              if(isManager) return true;
              if(currentRole==="admin") return m.role!=="manager";
              return m.name===currentUser; // 顧問只看自己
            }).map(m=>{
            const isSelf=m.name===currentUser;
            const isEditing=editId===m.id;
            return (
              <div key={m.id} style={{background:"#fff",borderRadius:12,
                border:isSelf?"1.5px solid "+roleColor[m.role]:"1px solid #e2e8f0",overflow:"hidden"}}>
                {isEditing
                  ?<div style={{padding:16}}>
                      {(isManager||(currentRole==="admin"&&!isSelf))
                        ?managerFormJSX(saveEdit,()=>setEditId(null),"💾 儲存")
                        :selfFormJSX(saveEdit,()=>setEditId(null))
                      }
                    </div>
                  :<div style={{padding:"14px 18px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      <Avatar name={m.name} size={42}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{m.name}</span>
                          <span style={{background:roleBg[m.role],color:roleColor[m.role],
                            border:`1px solid ${roleColor[m.role]}30`,borderRadius:99,
                            padding:"2px 9px",fontSize:11,fontWeight:700}}>{roleLabel[m.role]}</span>
                          {m.employmentType==="parttime"&&
                            <span style={{background:"#fef9c3",color:"#92400e",border:"1px solid #fde68a",
                              borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700}}>兼職</span>}
                          {(m.status)&&<span style={{background:STATUS_BG[m.status]||"#f1f5f9",
                            color:STATUS_COLOR[m.status]||"#64748b",
                            border:`1px solid ${STATUS_COLOR[m.status]||"#e2e8f0"}40`,
                            borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700}}>
                            {m.status}
                            {m.status==="試用期"&&m.startDate&&(
                              <span style={{fontWeight:400,marginLeft:4}}>
                                （{m.startDate} ～ {m.probationEnd||calcProbEnd(m.startDate)}）
                              </span>
                            )}
                          </span>}
                          {isSelf&&<span style={{fontSize:10,background:"#fef9c3",color:"#92400e",border:"1px solid #fde68a",borderRadius:99,padding:"1px 7px",fontWeight:700}}>👤 我</span>}
                        </div>
                        {m.status==="試用期"&&(()=>{
                          const prog=getProbationProgress(m);
                          if(!prog) return null;
                          const done=prog.count>=prog.target;
                          return (
                            <div style={{background:done?"#ecfdf5":"#fffbeb",border:`1px solid ${done?"#6ee7b7":"#fde68a"}`,
                              borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontSize:12,fontWeight:700,color:done?"#059669":"#92400e"}}>
                                  📊 試用期進度：{prog.count} / {prog.target} 人報名
                                  {done&&" ✅ 已達標！"}
                                </span>
                                <span style={{fontSize:12,fontWeight:800,color:done?"#059669":"#f59e0b"}}>{prog.pct}%</span>
                              </div>
                              <div style={{background:"rgba(0,0,0,0.08)",borderRadius:99,height:6}}>
                                <div style={{width:`${prog.pct}%`,height:"100%",
                                  background:done?"#10b981":"#f59e0b",borderRadius:99,transition:"width 0.4s"}}/>
                              </div>
                            </div>
                          );
                        })()}
                        <div style={{display:"flex",gap:12,fontSize:12,color:"#64748b",flexWrap:"wrap"}}>
                          {m.email&&<span>📧 {m.email}</span>}
                          {m.phone&&<span>📱 {m.phone}</span>}
                          {m.emergencyName&&<span>🆘 {m.emergencyName} {m.emergencyPhone}</span>}
                          {m.address&&<span>📍 {m.address}</span>}
                        </div>
                        <div style={{display:"flex",gap:12,fontSize:11,color:"#94a3b8",marginTop:3,flexWrap:"wrap"}}>
                          {m.startDate&&<span>📅 到職 {m.startDate}</span>}
                          {m.endDate&&<span style={{color:"#ef4444"}}>🚪 離職 {m.endDate}</span>}
                          {m.note&&<span>📝 {m.note}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {/* 管理者可編輯任何人；行政可編輯顧問和行政；顧問只能編輯自己 */}
                        {(isManager||(currentRole==="admin"&&m.role!=="manager")||isSelf)&&
                          <button onClick={()=>startEdit(m)}
                            style={{...btnS(isSelf&&!isManager?"#ecfdf5":"#eef2ff",isSelf&&!isManager?"#059669":"#6366f1"),
                              padding:"5px 12px",fontSize:12,
                              border:`1px solid ${isSelf&&!isManager?"#6ee7b7":"#c7d2fe"}`}}>
                            {isSelf&&!isManager?"✏️ 編輯個人資料":"✏️ 編輯"}
                          </button>}
                        {isManager&&
                          <button onClick={()=>setConsultantDB(prev=>prev.filter(x=>x.id!==m.id))}
                            style={{...btnS("#fef2f2","#ef4444"),padding:"5px 12px",fontSize:12,border:"1px solid #fca5a5"}}>🗑 刪除</button>}
                      </div>
                    </div>
                  </div>
                }
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ArchiveView=()=>{
    const [expandId,setExpandId]=React.useState(null);
    const list=archiveTab==="notEnroll"?visibleNotEnroll:visibleReturned;
    const isNotEnrollTab=archiveTab==="notEnroll";
    return (
      <div>
        <div style={{display:"flex",gap:0,marginBottom:18,background:"#f1f5f9",borderRadius:10,padding:4,width:"fit-content"}}>
          {[["notEnroll",`🚫 不報名／聯繫不上結案（${visibleNotEnroll.length}）`],["returned",`✅ 已回國結案（${visibleReturned.length}）`]].map(([tab,label])=>(
            <button key={tab} onClick={()=>{setArchiveTab(tab);setExpandId(null);}} style={{
              ...btnS(archiveTab===tab?"#fff":"transparent",archiveTab===tab?"#0f172a":"#64748b"),
              padding:"7px 18px",fontSize:13,
              boxShadow:archiveTab===tab?"0 1px 4px rgba(0,0,0,0.1)":undefined,
              borderRadius:8}}>{label}</button>
          ))}
        </div>
        {list.length===0
          ?<div style={{textAlign:"center",padding:60,color:"#94a3b8",fontSize:14}}>目前沒有此類結案學生</div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {list.map(s=>{
              const isExpanded=expandId===s.id;
              const closeCfg=s.closeType==="noContact"
                ?{color:"#64748b",bg:"#f8fafc",border:"#e2e8f0",label:"📵 聯繫不上結案"}
                :s.closeType==="notEnroll"
                  ?{color:"#ef4444",bg:"#fef2f2",border:"#fca5a5",label:"🚫 不報名結案"}
                  :s.closeType==="cancelEnroll"
                    ?{color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",label:"🚫 取消報名結案"}
                    :{color:"#0284c7",bg:"#e0f2fe",border:"#7dd3fc",label:"✅ 已回國結案"};
              return (
                <div key={s.id} style={{background:"#fff",borderRadius:12,
                  border:"1px solid #e2e8f0",overflow:"hidden"}}>
                  {/* 卡片列 */}
                  <div style={{padding:"14px 20px",display:"flex",alignItems:"center",gap:14}}>
                    <Avatar name={s.name} size={40}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:14}}>{s.name}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2,display:"flex",gap:10,flexWrap:"wrap"}}>
                        {s.consultDate&&<span>🗓️ 諮詢 {s.consultDate}</span>}
                        {s.consultant&&<span>👤 {s.consultant}</span>}
                        {(s.chosenSchool||s.school)&&<span>🏫 {s.chosenSchool||s.school}</span>}
                        {s.departDate&&<span>✈️ {s.departDate}</span>}
                      </div>
                    </div>
                    <span style={{background:closeCfg.bg,color:closeCfg.color,
                      border:`1px solid ${closeCfg.border}`,borderRadius:99,
                      padding:"3px 12px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                      {closeCfg.label}
                    </span>
                    {isNotEnrollTab
                      ?<button onClick={()=>setExpandId(isExpanded?null:s.id)}
                          style={{...btnS("#f1f5f9","#475569"),padding:"6px 14px",fontSize:12,whiteSpace:"nowrap"}}>
                          {isExpanded?"收起 ▲":"查看 ▼"}
                        </button>
                      :<button onClick={()=>{setSelId(s.id);setDetailTab("enroll");setView("detail");}}
                          style={{...btnS("#f1f5f9","#475569"),padding:"6px 14px",fontSize:12,whiteSpace:"nowrap"}}>
                          查看詳情
                        </button>
                    }
                  </div>
                  {/* 展開諮詢資料（只有不報名／聯繫不上） */}
                  {isNotEnrollTab&&isExpanded&&(
                    <div style={{borderTop:"1px solid #f1f5f9",padding:"16px 20px",background:"#fafbff"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                        {[
                          ["姓名",s.name],["電話",s.phone||"—"],["Email",s.email||"—"],
                          ["負責顧問",s.consultant||"—"],["諮詢日期",s.consultDate||"—"],
                          ["預計出發",s.departDate||"—"],["預計回程",s.returnDate||"—"],
                          ["就讀週數",s.weeks?s.weeks+"週":"—"],["優先度",s.priority==="high"?"緊急":s.priority==="medium"?"一般":"低"],
                        ].map(([l,v])=>(
                          <div key={l} style={{fontSize:12}}>
                            <span style={{color:"#94a3b8",fontWeight:600}}>{l}：</span>
                            <span style={{color:"#0f172a",fontWeight:600}}>{v}</span>
                          </div>
                        ))}
                      </div>
                      {s.consultNote&&(
                        <div style={{background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:8,
                          padding:"8px 12px",fontSize:12,color:"#3730a3",marginBottom:8}}>
                          <span style={{fontWeight:700}}>📝 諮詢備註：</span>{s.consultNote}
                        </div>
                      )}
                      {s.schoolList&&(
                        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,
                          padding:"8px 12px",fontSize:12,color:"#374151",marginBottom:8}}>
                          <span style={{fontWeight:700}}>🏫 提供學校清單：</span>
                          <div style={{marginTop:4,whiteSpace:"pre-wrap"}}>{s.schoolList}</div>
                        </div>
                      )}
                      {s.chosenSchool&&(
                        <div style={{background:"#ecfdf5",border:"1px solid #6ee7b7",borderRadius:8,
                          padding:"8px 12px",fontSize:12,color:"#065f46"}}>
                          <span style={{fontWeight:700}}>✅ 最後決定學校：</span>{s.chosenSchool}
                        </div>
                      )}
                      {s.sharedNote&&(
                        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,
                          padding:"8px 12px",fontSize:12,color:"#92400e",marginTop:8}}>
                          <span style={{fontWeight:700}}>📝 共用備註：</span>{s.sharedNote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
      </div>
    );
  };

  const DashboardView=()=>{
    const todayD=new Date(); todayD.setHours(0,0,0,0);
    const in15=new Date(todayD); in15.setDate(todayD.getDate()+15);
    const in2=new Date(todayD); in2.setDate(todayD.getDate()+2);

    const phaseStats=ENROLL_PHASE_ORDER.map(ph=>{
      const items=ENROLL_ITEMS.filter(t=>t.phase===ph);
      const total=items.length*enrolledStudents.length;
      const done=enrolledStudents.reduce((a,s)=>a+items.filter(t=>s.enrollTasks[t.id]?.status==="已完成").length,0);
      return {ph,total,done,pct:total>0?Math.round(done/total*100):0};
    });

    // 15天內即將出發
    const soonDepart=visibleEnrolled.filter(s=>{
      if(!s.departDate) return false;
      const d=new Date(s.departDate); d.setHours(0,0,0,0);
      return d>=todayD&&d<=in15;
    }).sort((a,b)=>new Date(a.departDate)-new Date(b.departDate));

    // 15天內即將回國
    const soonReturn=visibleEnrolled.filter(s=>{
      if(!s.returnDate) return false;
      const d=new Date(s.returnDate); d.setHours(0,0,0,0);
      return d>=todayD&&d<=in15;
    }).sort((a,b)=>new Date(a.returnDate)-new Date(b.returnDate));

    // 2天內待辦（以學生分組）
    const urgentTodos=[];
    visibleEnrolled.forEach(s=>{
      ENROLL_ITEMS.forEach(t=>{
        const ts=s.enrollTasks[t.id];
        if(!ts||ts.status==="已完成"||!ts.dueDate) return;
        const d=new Date(ts.dueDate); d.setHours(0,0,0,0);
        if(d<=in2) urgentTodos.push({student:s,task:t,ts,due:d,overdue:d<todayD});
      });
    });
    urgentTodos.sort((a,b)=>a.due-b.due);

    const SCard=({s,dateLabel,dateVal,color,bg})=>(
      <div onClick={()=>{setSelId(s.id);setDetailTab("enroll");setView("detail");}}
        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,
          background:bg,border:`1px solid ${color}30`,cursor:"pointer",marginBottom:7,transition:"all 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <Avatar name={s.name} size={32}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,color:"#0f172a",fontSize:13}}>{s.name}</div>
          <div style={{fontSize:11,color:"#64748b"}}>{s.school}　{s.consultant||""}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:color,fontWeight:700}}>{dateLabel}</div>
          <div style={{fontSize:12,color:"#0f172a",fontWeight:700}}>{dateVal}</div>
        </div>
      </div>
    );

    return (
      <div>
        {/* 統計卡 */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:20}}>
          {[
            {label:"諮詢中",val:visibleConsult.length,icon:"🔍",color:"#6366f1",bg:"#eef2ff"},
            {label:"正式報名",val:visibleEnrolled.length,icon:"📝",color:"#059669",bg:"#ecfdf5"},
            {label:"即將出發",val:soonDepart.length,icon:"✈️",color:"#ec4899",bg:"#fdf2f8"},
            {label:"已結案",val:visibleClosed.length,icon:"📁",color:"#64748b",bg:"#f1f5f9"},
            {label:"學生總數",val:visibleStudents.length,icon:"👥",color:"#3b82f6",bg:"#eff6ff"},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"16px 18px",
              border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:s.bg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{s.icon}</div>
              <div>
                <div style={{fontSize:26,fontWeight:900,color:"#0f172a",lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 第一列：各階段完成率 + 即將出發 + 即將回國 */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:14,marginBottom:14}}>
          {/* 各階段完成率 */}
          <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:14,marginBottom:14}}>正式報名各階段完成率</div>
            {phaseStats.map(({ph,total,done,pct})=>{
              const cfg=PHASE_CONFIG[ph];
              return (
                <div key={ph} style={{marginBottom:11}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{cfg.icon} {ph}</span>
                    <span style={{fontSize:12,color:cfg.color,fontWeight:700}}>{done}/{total} ({pct}%)</span>
                  </div>
                  <div style={{background:"#f1f5f9",borderRadius:99,height:7,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:cfg.color,borderRadius:99,minWidth:pct>0?4:0}}/>
                  </div>
                </div>
              );
            })}
            {visibleEnrolled.length===0&&<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:12}}>尚無正式報名學生</div>}
          </div>

          {/* 即將出發 */}
          <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:800,color:"#ec4899",fontSize:14,marginBottom:12}}>✈️ 即將出發（15天內）</div>
            {soonDepart.length>0
              ?soonDepart.map(s=><SCard key={s.id} s={s} dateLabel="出發日" dateVal={s.departDate} color="#ec4899" bg="#fdf2f8"/>)
              :<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:20}}>15天內無出發學生</div>
            }
          </div>

          {/* 即將回國 */}
          <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:800,color:"#0284c7",fontSize:14,marginBottom:12}}>🏠 即將回國（15天內）</div>
            {soonReturn.length>0
              ?soonReturn.map(s=><SCard key={s.id} s={s} dateLabel="回程日" dateVal={s.returnDate} color="#0284c7" bg="#e0f2fe"/>)
              :<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:20}}>15天內無回國學生</div>
            }
          </div>
        </div>

        {/* 第二列：2天內待辦 */}
        <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontWeight:800,color:"#ef4444",fontSize:14}}>🔥 2天內待辦清單</span>
            <span style={{background:"#fef2f2",color:"#ef4444",border:"1px solid #fca5a5",
              borderRadius:99,padding:"1px 9px",fontSize:11,fontWeight:700}}>{urgentTodos.length} 項</span>
            <button onClick={()=>setView("todo")}
              style={{marginLeft:"auto",background:"#f1f5f9",color:"#475569",border:"none",
                borderRadius:7,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              查看全部待辦 →
            </button>
          </div>
          {urgentTodos.length===0
            ?<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:16}}>✨ 2天內沒有待辦事項</div>
            :<div>
              {/* 以學生分組 */}
              {Array.from(new Set(urgentTodos.map(x=>x.student.id))).map(sid=>{
                const s=urgentTodos.find(x=>x.student.id===sid).student;
                const sItems=urgentTodos.filter(x=>x.student.id===sid);
                return (
                  <div key={sid} style={{marginBottom:10,background:"#fafbff",borderRadius:10,
                    border:"1px solid #e2e8f0",overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",
                      background:"#f1f5f9",borderBottom:"1px solid #e2e8f0"}}>
                      <Avatar name={s.name} size={24}/>
                      <span style={{fontWeight:700,fontSize:13,color:"#6366f1"}}>{s.name}</span>
                      <span style={{fontSize:11,color:"#94a3b8"}}>{s.consultant||""}</span>
                      <span style={{marginLeft:"auto",fontSize:11,color:"#ef4444",fontWeight:700}}>{sItems.length} 項</span>
                    </div>
                    {sItems.map((item,idx)=>{
                      const {task:t,ts}=item;
                      return (
                        <div key={t.id} style={{display:"grid",
                          gridTemplateColumns:"1fr 120px 100px",
                          padding:"8px 14px",gap:8,alignItems:"center",
                          borderBottom:idx===sItems.length-1?"none":"1px solid #f1f5f9",
                          background:item.overdue?"#fff8f8":"#fff"}}>
                          <div style={{fontSize:13,color:item.overdue?"#ef4444":"#0f172a",fontWeight:600}}>
                            {item.overdue&&"🔴 "}{t.task}
                          </div>
                          <select value={ts.status||"尚未進行"}
                            onChange={e=>updateTask(s.id,t.id,"status",e.target.value,"enroll")}
                            style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"3px 7px",
                              fontSize:12,fontFamily:"inherit",outline:"none",cursor:"pointer",
                              background:"#fff",color:"#0f172a"}}>
                            {["尚未進行","進行中","待確認","已完成"].map(st=>(
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                          <div style={{fontSize:12,color:item.overdue?"#ef4444":"#374151",
                            fontWeight:item.overdue?700:400,textAlign:"right"}}>
                            {ts.dueDate}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          }
        </div>

        {/* 試用期顧問達成率（僅管理者可見） */}
        {currentRole==="manager"&&(()=>{
          const probMembers=consultantDB.filter(m=>m.status==="試用期");
          if(probMembers.length===0) return null;
          return (
            <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #e2e8f0",marginTop:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <span style={{fontWeight:800,color:"#f59e0b",fontSize:14}}>🧪 試用期顧問達成率</span>
                <span style={{background:"#fffbeb",color:"#f59e0b",border:"1px solid #fde68a",
                  borderRadius:99,padding:"1px 9px",fontSize:11,fontWeight:700}}>{probMembers.length} 位</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {probMembers.map(m=>{
                  const count=[...enrolledStudents,...closedStudents].filter(s=>
                    s.consultant===m.name&&s.enrollDate&&
                    (!m.startDate||s.enrollDate>=m.startDate)&&
                    (!m.probationEnd||s.enrollDate<=m.probationEnd)
                  ).length;
                  const target=m.probationTarget||5;
                  const pct=Math.min(100,Math.round(count/target*100));
                  const done=count>=target;
                  const probEnd=m.probationEnd||"—";

                  // 找到第幾筆報名時達標（目標達成日）
                  const allEnrolls=[...visibleEnrolled,...visibleClosed]
                    .filter(s=>s.consultant===m.name&&s.enrollDate&&
                      (!m.startDate||s.enrollDate>=m.startDate)&&
                      (!m.probationEnd||s.enrollDate<=m.probationEnd))
                    .sort((a,b)=>a.enrollDate.localeCompare(b.enrollDate));
                  const achieveDate=allEnrolls.length>=target?allEnrolls[target-1].enrollDate:"—";

                  return (
                    <div key={m.id} style={{background:done?"#ecfdf5":"#fffbeb",
                      border:`1.5px solid ${done?"#6ee7b7":"#fde68a"}`,borderRadius:10,padding:"12px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <Avatar name={m.name} size={32}/>
                          <div>
                            <div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>{m.name}</div>
                            <div style={{fontSize:11,color:"#64748b"}}>試用期：{m.startDate||"—"} ～ {probEnd}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:20,fontWeight:900,color:done?"#059669":"#f59e0b"}}>
                            {count} <span style={{fontSize:13,color:"#64748b"}}>/ {target} 人</span>
                          </div>
                          {done
                            ?<div style={{fontSize:11,color:"#059669",fontWeight:700}}>✅ 達標日：{achieveDate}</div>
                            :<div style={{fontSize:11,color:"#94a3b8"}}>尚差 {target-count} 人達標</div>
                          }
                        </div>
                      </div>
                      {/* 進度條 */}
                      <div style={{background:"rgba(0,0,0,0.08)",borderRadius:99,height:8,marginBottom:6}}>
                        <div style={{width:`${pct}%`,height:"100%",
                          background:done?"#10b981":"#f59e0b",borderRadius:99,transition:"width 0.4s"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                        <div style={{color:"#64748b"}}>
                          {allEnrolls.slice(0,target).map((s,i)=>(
                            <span key={s.id} style={{marginRight:6,color:i<count?"#059669":"#94a3b8"}}>
                              {i+1}.{s.name}（{s.enrollDate}）
                            </span>
                          ))}
                        </div>
                        <span style={{fontWeight:800,color:done?"#059669":"#f59e0b",flexShrink:0}}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ── NAV + Layout ─────────────────────────────────────────────
  // 計算7天內待辦數量作為 badge
  const today=new Date(); today.setHours(0,0,0,0);
  const in7=new Date(today); in7.setDate(in7.getDate()+7);
  const todoCount=visibleEnrolled.reduce((acc,s)=>
    acc+ENROLL_ITEMS.filter(t=>{
      const ts=s.enrollTasks[t.id]; if(!ts||ts.status==="已完成") return false;
      if(!ts.dueDate) return false;
      const d=new Date(ts.dueDate); return d<=in7;
    }).length, 0);

  const NAV=[
    {id:"dashboard",icon:"⊞",label:"儀表板"},
    {id:"todo",     icon:"✅",label:"待辦清單", badge:todoCount},
    {id:"members",  icon:"👤",label:"顧問資訊"},
    {id:"schooldb", icon:"🏫",label:"學校資料庫"},
    {id:"consult",  icon:"🔍",label:"諮詢中",   badge:visibleConsult.length},
    {id:"enrolled", icon:"📝",label:"正式報名", badge:visibleEnrolled.length},
    {id:"archive",  icon:"📁",label:"結案學生", badge:visibleClosed.length},
    {id:"revenue",  icon:"💰",label:"業績", hide:currentRole==="admin"},
    {id:"mybonus",  icon:"🎁",label:"我的獎金明細", hide:currentRole==="admin"},
    {id:"payment",  icon:"💳",label:"每月應發獎金", hide:currentRole!=="manager"},
    {id:"detail",   icon:"📋",label:"流程檢核", hide:true},
    {id:"report",   icon:"📊",label:"營運報告", hide:currentRole!=="manager"},
    {id:"settings", icon:"⚙️",label:"系統設定", hide:currentRole!=="manager"},
  ];

  // 登入處理
  const handleLogin=async()=>{
    try{
      setLoginErr("");
      await signInWithEmailAndPassword(auth,loginEmail,loginPwd);
      // onAuthStateChanged 會處理登入狀態
    }catch(err){
      if(err.code==="auth/wrong-password"||err.code==="auth/user-not-found"||err.code==="auth/invalid-credential")
        setLoginErr("帳號或密碼錯誤");
      else setLoginErr("登入失敗："+err.message);
    }
  };

  // 監聽 Firebase 登入狀態
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,(user)=>{
      if(user){
        setIsLoggedIn(true);
        setLoginEmail(user.email);
        // 用 email 比對 accounts 來設定角色
        const acc=accounts.find(a=>a.email===user.email);
        if(acc){setCurrentRole(acc.role);setCurrentUser(acc.name);}
        else{setCurrentRole("manager");setCurrentUser(user.email.split("@")[0]);}
      }else{
        setIsLoggedIn(false);
      }
    });
    return ()=>unsub();
  },[]);

  // ── Firestore 資料同步 ──────────────────────────────────
  // 學生資料
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"students"),(snap)=>{
      const data=snap.docs.map(d=>({...d.data(),id:d.id,_firestoreId:d.id}));
      setStudents(data);
    });
    return ()=>unsub();
  },[]);
  // 學校資料
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"schools"),(snap)=>{
      const data=snap.docs.map(d=>({...d.data(),id:d.id}));
      setSchoolDB(data);
    });
    return ()=>unsub();
  },[]);
  // 顧問資料
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"consultants"),(snap)=>{
      const data=snap.docs.map(d=>({...d.data(),id:d.id}));
      if(data.length>0) setConsultantDB(data);
    });
    return ()=>unsub();
  },[]);

  // ── Firestore 儲存 helpers ──────────────────────────────
  const saveStudentToDB=async(student)=>{
    const id=String(student.id||student._firestoreId||Date.now());
    const clean={...student};
    delete clean._firestoreId;
    clean.id=id;
    await setDoc(doc(db,"students",id),clean);
  };
  const deleteStudentFromDB=async(id)=>{
    await deleteDoc(doc(db,"students",String(id)));
  };
  const saveSchoolToDB=async(school)=>{
    const id=String(school.id||Date.now());
    await setDoc(doc(db,"schools",id),{...school,id});
  };
  const deleteSchoolFromDB=async(id)=>{
    await deleteDoc(doc(db,"schools",String(id)));
  };
  const saveConsultantToDB=async(member)=>{
    const id=String(member.id||Date.now());
    await setDoc(doc(db,"consultants",id),{...member,id});
  };
  const deleteConsultantFromDB=async(id)=>{
    await deleteDoc(doc(db,"consultants",String(id)));
  };
  const handleChangePwd=()=>{
    if(newPwd.length<6){setChangePwdErr("密碼至少6碼");return;}
    if(newPwd!==newPwd2){setChangePwdErr("兩次密碼不一致");return;}
    setAccounts(prev=>prev.map(a=>a.email===loginEmail?{...a,password:newPwd,firstLogin:false}:a));
    setMustChangePwd(false);
    setIsLoggedIn(true);
    setChangePwdErr("");
  };

  const inp3={border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 14px",fontSize:14,
    fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box",background:"#fff"};

  // 修改密碼頁
  if(mustChangePwd) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e1b4b,#4338ca)",
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans TC','DM Sans',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:18,padding:"40px 36px",width:380,boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,marginBottom:6}}>🔐</div>
          <div style={{fontSize:20,fontWeight:900,color:"#0f172a"}}>首次登入需更改密碼</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>請設定您的新密碼（至少6碼）</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)}
            placeholder="新密碼" style={inp3}/>
          <input type="password" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)}
            placeholder="確認新密碼" style={inp3}
            onKeyDown={e=>e.key==="Enter"&&handleChangePwd()}/>
          {changePwdErr&&<div style={{color:"#ef4444",fontSize:13}}>{changePwdErr}</div>}
          <button onClick={handleChangePwd}
            style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:9,padding:"12px",
              fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
            確認更改密碼
          </button>
        </div>
      </div>
    </div>
  );

  // 登入頁
  if(!isLoggedIn) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e1b4b,#4338ca)",
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans TC','DM Sans',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:18,padding:"40px 36px",width:400,boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:13,color:"#6366f1",fontWeight:800,letterSpacing:2,marginBottom:6}}>🇵🇭 TALKUS</div>
          <div style={{fontSize:22,fontWeight:900,color:"#0f172a",marginBottom:4}}>菲律賓遊學流程管理</div>
          <div style={{fontSize:13,color:"#94a3b8"}}>台灣透客文教有限公司</div>
        </div>
        {!forgotMode
          ?<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>登入帳號（Email）</label>
              <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}
                placeholder="your@email.com" style={inp3}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>密碼</label>
              <input type="password" value={loginPwd} onChange={e=>setLoginPwd(e.target.value)}
                placeholder="••••••" style={inp3}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
            </div>
            {loginErr&&<div style={{color:"#ef4444",fontSize:13,fontWeight:600}}>{loginErr}</div>}
            <button onClick={handleLogin}
              style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:9,padding:"13px",
                fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
              登入
            </button>
            <button onClick={()=>setForgotMode(true)}
              style={{background:"transparent",border:"none",color:"#6366f1",fontSize:13,
                cursor:"pointer",fontFamily:"inherit",padding:4,textAlign:"center"}}>
              忘記密碼？
            </button>
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>
              輸入您的 Email，系統將顯示重設連結（⚠️ 此為模擬功能，實際Email發送需後端支援）
            </div>
            <input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)}
              placeholder="your@email.com" style={inp3}/>
            {forgotSent
              ?<div style={{background:"#ecfdf5",border:"1px solid #6ee7b7",borderRadius:8,
                  padding:"10px 14px",fontSize:13,color:"#059669",fontWeight:600}}>
                ✅ 重設連結已傳送至 {forgotEmail}（模擬）
                <br/><span style={{fontSize:11,color:"#64748b"}}>⚠️ 實際環境需整合後端Email服務</span>
              </div>
              :<button onClick={async()=>{
                  try{await sendPasswordResetEmail(auth,forgotEmail);setForgotSent(true);}
                  catch(err){setLoginErr("發送失敗："+err.message);}
                }}
                style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:9,padding:"12px",
                  fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                發送重設連結
              </button>
            }
            <button onClick={()=>{setForgotMode(false);setForgotSent(false);setForgotEmail("");}}
              style={{background:"transparent",border:"none",color:"#64748b",fontSize:13,
                cursor:"pointer",fontFamily:"inherit",padding:4}}>
              ← 返回登入
            </button>
          </div>
        }

      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Noto Sans TC','DM Sans',sans-serif",background:"#f1f5f9",minHeight:"100vh",display:"flex"}}
      onClick={()=>{if(editCell?.field==="status")setEditCell(null);}}>
      {/* Sidebar */}
      <div style={{width:210,background:"#0f172a",flexShrink:0,display:"flex",flexDirection:"column",
        position:"fixed",top:0,left:0,bottom:0,zIndex:100}}>
        <div style={{padding:"22px 20px 18px",borderBottom:"1px solid #1e293b"}}>
          <div style={{fontSize:11,color:"#6366f1",fontWeight:800,letterSpacing:2,marginBottom:5}}>🇵🇭 TALKUS</div>
          <div style={{fontSize:15,color:"#f8fafc",fontWeight:800,lineHeight:1.35}}>菲律賓遊學<br/>流程管理</div>
        </div>
        <nav style={{padding:"14px 12px",flex:1}}>
          {NAV.filter(n=>!n.hide).map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{
              display:"flex",alignItems:"center",gap:10,width:"100%",
              background:view===n.id?"#6366f1":"transparent",
              color:view===n.id?"#fff":"#94a3b8",
              border:"none",borderRadius:8,padding:"10px 14px",
              cursor:"pointer",fontSize:14,fontWeight:view===n.id?700:500,
              textAlign:"left",fontFamily:"inherit",marginBottom:3,transition:"all 0.15s"}}>
              <span style={{fontSize:16}}>{n.icon}</span>
              <span style={{flex:1}}>{n.label}</span>
              {n.badge>0&&(
                <span style={{background:view===n.id?"rgba(255,255,255,0.25)":"#6366f1",
                  color:"#fff",borderRadius:99,fontSize:11,fontWeight:800,
                  padding:"1px 7px",minWidth:20,textAlign:"center"}}>{n.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{padding:"14px 20px",borderTop:"1px solid #1e293b"}}>
          <div style={{fontSize:11,color:"#a5b4fc",fontWeight:700,marginBottom:2}}>{currentUser}</div>
          <div style={{fontSize:10,color:"#475569",marginBottom:6}}>{{manager:"管理者",consultant:"顧問",admin:"行政"}[currentRole]}</div>
          <button onClick={()=>{signOut(auth);setIsLoggedIn(false);setLoginEmail("");setLoginPwd("");}}
            style={{background:"rgba(239,68,68,0.15)",color:"#fca5a5",border:"1px solid rgba(239,68,68,0.3)",
              borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",
              fontFamily:"inherit",width:"100%"}}>
            登出
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{marginLeft:210,flex:1}}>
        <div style={{background:"#fff",padding:"15px 30px",borderBottom:"1px solid #e2e8f0",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,zIndex:90,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div>
            <div style={{fontSize:19,fontWeight:800,color:"#0f172a"}}>
              {view==="dashboard"&&"儀表板"}
              {view==="consult"&&"諮詢中學生"}
              {view==="enrolled"&&"正式報名學生"}
              {view==="archive"&&"結案學生"}
              {view==="revenue"&&"業績"}
              {view==="payment"&&"每月應發放獎金"}
              {view==="mybonus"&&"我的獎金明細"}
              {view==="todo"&&"待辦清單"}
              {view==="schooldb"&&"學校資料庫"}
              {view==="members"&&"顧問資料"}
              {view==="settings"&&"系統設定"}
              {view==="report"&&"營運報告"}
              {view==="detail"&&(sel?`${sel.name} ─ 流程檢核`:"")}
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>台灣透客文教有限公司　菲律賓遊學管理後台</div>
          </div>
          {view==="detail"&&(
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <span style={{fontSize:12,color:"#64748b"}}>切換：</span>
              {[...visibleConsult,...visibleEnrolled,...visibleClosed].map(s=>(
                <button key={s.id}
                  onClick={()=>{setSelId(s.id);setDetailTab(s.type==="consult"?"consult":"enroll");}}
                  style={{...btnS(selId===s.id?"#6366f1":"#f1f5f9",selId===s.id?"#fff":"#475569"),
                    padding:"5px 12px",fontSize:12}}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:26}}>
          {view==="dashboard"&&<DashboardView/>}
          {view==="consult"  &&<ConsultView/>}
          {view==="enrolled" &&<EnrolledView/>}
          {view==="todo"     &&<TodoView/>}
          {view==="detail"   &&<DetailView/>}
          {view==="archive"  &&<ArchiveView/>}
          {view==="revenue"  &&<RevenueView/>}
          {view==="payment"  &&<PaymentView/>}
          {view==="mybonus"  &&<MyBonusView/>}
          {view==="schooldb" &&<SchoolDBView/>}
          {view==="settings"  &&<SettingsView/>}
          {view==="report"    &&<ReportView/>}
          {view==="members"  &&<MembersView/>}
        </div>
      </div>

      {/* Modals */}
      {showAddModal&&<AddStudentModal mode={showAddModal} onConfirm={confirmAdd} onCancel={()=>setShowAddModal(null)} schoolDB={schoolDB} consultantDB={consultantDB} currentRole={currentRole} currentUser={currentUser}/>}
      {editEnrolledId&&(()=>{
        const es=students.find(s=>s.id===editEnrolledId);
        return es?<EditEnrolledModal key={JSON.stringify(es)} student={es}
          onConfirm={confirmEditEnrolled}
          onCancelEnroll={confirmCancelEnrolled}
          onCancel={()=>setEditEnrolledId(null)}
          consultantDB={consultantDB}/>:null;
      })()}
      {editStudentId&&(()=>{
        const latestEdit=students.find(s=>s.id===editStudentId);
        return latestEdit
          ?<AddStudentModal key={JSON.stringify(latestEdit)} mode="consult" prefill={latestEdit} onConfirm={confirmEdit} onCancel={()=>setEditStudentId(null)} schoolDB={schoolDB} consultantDB={consultantDB} currentRole={currentRole} currentUser={currentUser}/>
          :null;
      })()}
      {upgradeStudentId&&(()=>{
        const latestStudent=students.find(s=>s.id===upgradeStudentId);
        return latestStudent
          ?<UpgradeModal key={JSON.stringify(latestStudent)} student={latestStudent} onConfirm={(form)=>confirmUpgrade(latestStudent,form)} onClose={(form,ct)=>confirmClose(latestStudent,form,ct)} onCancel={()=>setUpgradeStudentId(null)} consultantDB={consultantDB}/>
          :null;
      })()}
    </div>
  );
}
