$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$s = "    async function _renderGantt2() {"
$e = "    async function _renderFruit() {"
$si = $c.IndexOf($s); $ei = $c.IndexOf($e)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL"; exit }
$before = $c.Substring(0, $si); $after = $c.Substring($ei)

$fn = @'
    async function _renderGantt2() {
      body.innerHTML='<div style="text-align:center;padding:10px;color:#888;font-size:.5rem">Loading Zooper...</div>';
      if(!document.getElementById('pomo-pulse-css')){var sty=document.createElement('style');sty.id='pomo-pulse-css';sty.textContent='@keyframes pomoPulse{0%,100%{box-shadow:0 0 3px rgba(255,107,53,.4)}50%{box-shadow:0 0 8px rgba(255,107,53,.8)}}';document.head.appendChild(sty);}
      var now=new Date(),isDk=_state.theme!=='light';
      var txt=isDk?'#ddd':'#222',bg2=isDk?'rgba(255,255,255,.03)':'rgba(0,0,0,.02)',bdr=isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';
      var todayD=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      var off=_state.offset||0;
      var bM=now.getMonth(),bY=now.getFullYear(),bH=now.getDate()<=15?0:1;
      var tH=bM*2+bH+off;var spY=bY+Math.floor(tH/24);tH=((tH%24)+24)%24;
      var spM=Math.floor(tH/2),spHf=tH%2;
      var sprintStart,spDays;
      if(spHf===0){sprintStart=new Date(spY,spM,1);spDays=15;}
      else{sprintStart=new Date(spY,spM,16);spDays=new Date(spY,spM+1,0).getDate()-15;}
      var sprintEnd=new Date(sprintStart);sprintEnd.setDate(sprintStart.getDate()+spDays);
      var sessions=[{start:0,tip:'\u062b\u0644\u062b \u0627\u0644\u0644\u064a\u0644 \u0627\u0644\u0622\u062e\u0631'},{start:4,tip:'\u062b\u0644\u062b \u0627\u0644\u0646\u0647\u0627\u0631 \u0627\u0644\u0623\u0648\u0644 (\u0648\u0642\u0631\u0622\u0646 \u0627\u0644\u0641\u062c\u0631)'},{start:8},{start:12},{start:16},{start:20}];
      var LAYOUT=[{slot:0,fl:1},{slot:1,fl:1},{slot:2,fl:1},{type:'gap',fl:1},{slot:3,fl:1},{type:'div'},{slot:4,fl:2},{type:'gap',fl:2},{slot:5,fl:2},{slot:6,fl:2},{slot:7,fl:2}];
      function hijriDay(d){try{return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{day:'numeric'}).format(d);}catch(e){return '';}}
      try{
        var allEv=await fetchCalendarEvents(sprintStart,sprintEnd);
        var evts=(allEv||[]).filter(function(e){return !e.allDay;});
        var fruitCalId='';
        try{var cals=await getCalendarList();var frCal=cals.find(function(c){return c.summary.toLowerCase()==="!40's fruit";});if(frCal)fruitCalId=frCal.id;}catch(e){}
        body._ganttRender=function(){_renderGantt2();};
        var CS=14,DW=2,cardW=10*CS+DW;
        var dn=['Su','Mo','Tu','We','Th','Fr','Sa'];
        // ROOT - no scroll
        var root=document.createElement('div');
        root.style.cssText='display:flex;flex-direction:column;height:100%;box-sizing:border-box;font-family:var(--font);overflow:hidden;';
        // ─── ROW 1: first 7 days ───
        function makeCardRow(startIdx,count){
          var row=document.createElement('div');
          row.style.cssText='display:flex;flex-direction:row-reverse;gap:3px;justify-content:center;flex-shrink:0;padding:1px 2px;';
          for(var d=startIdx;d<startIdx+count&&d<spDays;d++){
            var dayDate=new Date(sprintStart);dayDate.setDate(sprintStart.getDate()+d);
            var dayMs=new Date(dayDate.getFullYear(),dayDate.getMonth(),dayDate.getDate()).getTime();
            var dayEnd2=dayMs+86400000,isToday=(dayDate.toDateString()===now.toDateString()),isFuture=dayMs>todayD.getTime();
            var dayEvts=evts.filter(function(e){var es=new Date(e.start).getTime(),ee=new Date(e.end).getTime();return es<dayEnd2&&ee>dayMs;});
            var frSlotMap={};
            dayEvts.filter(function(e){return(e.calendarName||'').toLowerCase()==="!40's fruit";}).forEach(function(ev){var s2=new Date(ev.start).getTime(),e2=new Date(ev.end).getTime();var ss=Math.floor((s2-dayMs)/1800000),se=Math.ceil((e2-dayMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!frSlotMap[x])frSlotMap[x]=[];frSlotMap[x].push(ev);}}});
            function hasZS(sess,slots){for(var fi=0;fi<slots.length;fi++){var sm=(sess.start*60)+(slots[fi]*30),sx=sm+30;for(var ei=0;ei<dayEvts.length;ei++){var cn=(dayEvts[ei].calendarName||'').toLowerCase();if(cn!=='03g'&&cn!=='04g2')continue;var esM=new Date(dayEvts[ei].start).getHours()*60+new Date(dayEvts[ei].start).getMinutes();var eeM=new Date(dayEvts[ei].end).getHours()*60+new Date(dayEvts[ei].end).getMinutes();if(eeM===0)eeM=1440;if(esM<sx&&eeM>sm)return true;}}return false;}
            var dayFruitCount=0;for(var fk=0;fk<48;fk++){if((frSlotMap[fk]||[]).length>0)dayFruitCount++;}
            var bananaCount=0;for(var bsi=0;bsi<6;bsi++){if(hasZS(sessions[bsi],[0,1,2,3]))bananaCount++;if(hasZS(sessions[bsi],[4,5,6,7]))bananaCount++;}
            // CARD
            var card=document.createElement('div');
            card.style.cssText='display:inline-flex;flex-direction:column;flex-shrink:0;border:1px solid '+(isToday?'#4285f4':bdr)+';border-radius:3px;'+(isToday?'background:rgba(66,133,244,.07);box-shadow:0 0 3px rgba(66,133,244,.3);':'')+(isFuture?'opacity:.3;':'');
            // HEADER: single row [4Mo] [🍎x/16 🍌x/6] [17]
            var hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:0 2px;border-bottom:1px solid '+bdr+';height:12px;flex-shrink:0;gap:1px;';
            var hL=document.createElement('span');hL.style.cssText='font-size:.35rem;font-weight:900;color:'+(isToday?'#4285f4':(isDk?'#ddd':'#111'))+';white-space:nowrap;';hL.textContent=dayDate.getDate()+dn[dayDate.getDay()];
            var hM=document.createElement('span');hM.style.cssText='font-size:.3rem;font-weight:700;display:flex;gap:2px;';
            var sa=document.createElement('span');sa.style.cssText='color:'+(dayFruitCount>0?'#e74c3c':'rgba(128,128,128,.3)')+';';sa.textContent='\uD83C\uDF4E'+dayFruitCount;
            var sb=document.createElement('span');sb.style.cssText='color:'+(bananaCount>0?'#f1c40f':'rgba(128,128,128,.3)')+';';sb.textContent='\uD83C\uDF4C'+bananaCount;
            hM.appendChild(sa);hM.appendChild(sb);
            var hR=document.createElement('span');hR.style.cssText='font-size:.35rem;font-weight:800;color:#27ae60;';hR.textContent=hijriDay(dayDate);
            hdr.appendChild(hL);hdr.appendChild(hM);hdr.appendChild(hR);card.appendChild(hdr);
            // 6 sessions
            var allCells=[];
            for(var si=0;si<6;si++){
              var sess=sessions[si],f1z=hasZS(sess,[0,1,2,3]),f2z=hasZS(sess,[4,5,6,7]),sessOK=f1z&&f2z,isSpec=(si===0||si===1);
              var sessClr=sessOK?'#27ae60':(isDk?'rgba(255,255,255,.12)':'rgba(0,0,0,.1)');
              var sr=document.createElement('div');sr.style.cssText='display:flex;align-items:stretch;height:'+CS+'px;flex-shrink:0;outline:1px solid '+sessClr+';outline-offset:-1px;position:relative;'+(sessOK||isSpec?'background:rgba(39,174,96,'+(sessOK?'.06':'.08')+');':'')+(si>0?'border-top:1px solid '+(isDk?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)')+';':'');
              if(sess.tip)sr.title=sess.tip;
              LAYOUT.forEach(function(lc){
                if(lc.type==='div'){sr.appendChild(Object.assign(document.createElement('div'),{style:{cssText:'width:'+DW+'px;flex-shrink:0;background:'+(sessOK?'rgba(39,174,96,.2)':bdr)+';'}}));return;}
                if(lc.type==='gap'){var fz=lc.fl===1?f1z:f2z;var gp=document.createElement('div');gp.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(6,CS-4))+'px;pointer-events:none;';if(fz)gp.textContent='\uD83C\uDF4C';sr.appendChild(gp);return;}
                var sIS=lc.slot,absSlot=si*8+sIS,sMn=(sess.start*60)+(sIS*30),eMn=sMn+30;
                var sD=new Date(dayMs+sMn*60000),eD=new Date(dayMs+eMn*60000);
                var h1v=Math.floor(sMn/60),m1=sMn%60;
                var sEvts=dayEvts.filter(function(e2){if((e2.calendarName||'').toLowerCase()==="!40's fruit")return false;var esM=new Date(e2.start).getHours()*60+new Date(e2.start).getMinutes();var eeM=new Date(e2.end).getHours()*60+new Date(e2.end).getMinutes();if(eeM===0)eeM=1440;return esM<eMn&&eeM>sMn;});
                var cBg=sEvts.length>0?(sEvts[0].color||'#4285f4'):'transparent';
                var isNow=false;if(isToday){var nM=now.getHours()*60+now.getMinutes();if(nM>=sMn&&nM<eMn)isNow=true;}
                var hFr=(frSlotMap[absSlot]||[]).length>0;var isBr=(lc.slot===3||lc.slot===4);
                var ec=document.createElement('div');ec.className='pomo-ev';
                ec.style.cssText='width:'+CS+'px;flex-shrink:0;position:relative;background:'+(cBg!=='transparent'?cBg:(isBr?'rgba(128,128,128,.06)':bg2))+';cursor:pointer;border-right:1px solid '+(isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)')+';display:flex;align-items:center;justify-content:center;'+(isNow?'outline:2px solid #ff6b35;outline-offset:-1px;animation:pomoPulse 1.5s infinite;z-index:1;':'');
                if(hFr){var frS=document.createElement('span');frS.style.cssText='font-size:'+(Math.max(6,CS-4))+'px;pointer-events:none;';frS.textContent='\uD83C\uDF4E';ec.appendChild(frS);}
                else if(sEvts.length===0){var tl=document.createElement('span');tl.style.cssText='font-size:'+Math.min(CS-2,10)+'px;color:'+(isDk?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)')+';font-weight:'+(m1===0?'700':'400')+';pointer-events:none;';tl.textContent=m1===0?String((h1v%12)||12):'30';ec.appendChild(tl);}
                (function(ec,se,sd,ed,as,hf,fsm,fci){ec.addEventListener('click',function(ev2){ev2.stopPropagation();if(ev2.ctrlKey||ev2.metaKey){if(!fci)return;var fEvs=fsm[as]||[];if(hf&&fEvs.length>0){deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id).then(function(){_renderGantt2();});}else{createCalendarEvent(fci,"!40's Fruit",sd,ed,'').then(function(){_renderGantt2();});}}else{if(se.length>0){var e0=se[0];showCalendarEventForm(body,body,null,{mode:'edit',calendarId:e0.calendarId,eventId:e0.id,summary:e0.summary,description:e0.description,startTime:new Date(e0.start),endTime:new Date(e0.end)});}else{showCalendarEventForm(body,body,null,{mode:'create',startTime:sd,endTime:ed});}}});})(ec,sEvts,sD,eD,absSlot,hFr,frSlotMap,fruitCalId);
                sr.appendChild(ec);allCells.push({ev:ec,absSlot:absSlot,slotStartMin:sMn,slotEndMin:eMn,dayMs:dayMs});
              });
              if(isSpec&&sess.tip){var bgT=document.createElement('div');bgT.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:'+Math.max(6,CS-3)+'px;color:rgba(39,174,96,.18);font-weight:900;pointer-events:none;z-index:0;white-space:nowrap;overflow:hidden;';bgT.textContent=sess.tip;sr.appendChild(bgT);}
              card.appendChild(sr);
            }
            (function(ac,dm,fci,fsm){var mode=null,si2=-1,isCtrl=false;function gCA(x,y){for(var i=0;i<ac.length;i++){var r=ac[i].ev.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return i;}return-1;}function hl(a,b){ac.forEach(function(c,i){c.ev.style.outline=(i>=a&&i<=b)?'2px solid '+(isCtrl?'#e74c3c':'#4285f4'):'none';});}function clr(){ac.forEach(function(c){c.ev.style.outline='none';});}ac.forEach(function(c,i){c.ev.addEventListener('mousedown',function(e){if(e.button!==0)return;mode='ev';si2=i;isCtrl=e.ctrlKey||e.metaKey;hl(i,i);e.preventDefault();});});document.addEventListener('mousemove',function(e){if(!mode)return;var h=gCA(e.clientX,e.clientY);if(h<0)return;hl(Math.min(si2,h),Math.max(si2,h));});document.addEventListener('mouseup',function(){if(!mode)return;mode=null;var sel=[];ac.forEach(function(c){if(c.ev.style.outline&&c.ev.style.outline!=='none')sel.push(c);});clr();if(isCtrl&&sel.length>=1&&fci){var hc=sel.filter(function(c2){return(fsm[c2.absSlot]||[]).length>0;}).length;var doDelete=hc>sel.length/2;var ops=[];sel.forEach(function(c2){var fEvs=fsm[c2.absSlot]||[];if(doDelete&&fEvs.length>0)ops.push(deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id));else if(!doDelete&&fEvs.length===0)ops.push(createCalendarEvent(fci,"!40's Fruit",new Date(dm+c2.slotStartMin*60000),new Date(dm+c2.slotEndMin*60000),''));});if(ops.length)Promise.all(ops).then(function(){_renderGantt2();}).catch(function(){_renderGantt2();});}else if(!isCtrl&&sel.length>=2){var sMin=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));var eMin=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));showCalendarEventForm(body,body,null,{mode:'create',startTime:new Date(dm+sMin*60000),endTime:new Date(dm+eMin*60000)});}});
            })(allCells,dayMs,fruitCalId,frSlotMap);
            row.appendChild(card);
          }
          return row;
        }
        root.appendChild(makeCardRow(0,7));
        if(spDays>7) root.appendChild(makeCardRow(7,spDays-7));
        // ─── STATS: 7 charts in 2 rows, fill remaining space ───
        var epoch=new Date(2025,9,28);epoch.setHours(0,0,0,0);
        var allEvS=await fetchCalendarEvents(epoch,new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
        var excl=['phases of the moon','holidays in egypt','muslim holidays',"!40's fruit"];
        allEvS=(allEvS||[]).filter(function(e){return excl.indexOf((e.calendarName||'').toLowerCase())===-1&&!e.allDay;});
        var cMap={};allEvS.forEach(function(e){if(e.calendarName)cMap[e.calendarName]=e.color||'#4285f4';});
        var plan={'01R':3,'02W':1,'02xO':2,'03G':2,'04G2':1,'05B':0,'06C':0,'07J':0,'08M':1,'09N':1,'10Y':1,'11L':0.5,'12k':0.5,'13S':7};
        var cRows=[{type:'plan',label:'Pln:Wrk',cals:['01R','02W','02xO']},{type:'actual',label:'Sleep',cals:['13S']},{type:'actual',label:'Work',cals:['01R','02W','02xO']},{type:'sep'},{type:'plan',label:'Pln:Dev',cals:['08M','09N','10Y','03G','04G2']},{type:'actual',label:'Family',cals:['06C','07J']},{type:'actual',label:'Dev',cals:['08M','09N','10Y','03G','04G2']},{type:'sep'},{type:'plan',label:'Pln:Lsr',cals:['11L','12k']},{type:'actual',label:'Maint',cals:['05B']},{type:'actual',label:'Leisure',cals:['11L','12k']}];
        var oneJan=new Date(now.getFullYear(),0,1);var wkNum=Math.ceil(((now-oneJan)/86400000+oneJan.getDay()+1)/7);var spNum=Math.ceil(wkNum/2);
        var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var ranges=[
          {id:'week',label:'W'+wkNum,s:function(){var d=new Date(now);d.setDate(d.getDate()-d.getDay());d.setHours(0,0,0,0);return d;},e:function(){var d=new Date(now);d.setDate(d.getDate()-d.getDay()+7);d.setHours(0,0,0,0);return d;}},
          {id:'sprint',label:'S'+spNum,s:function(){return new Date(sprintStart);},e:function(){return new Date(sprintEnd);}},
          {id:'month',label:mn[now.getMonth()],s:function(){return new Date(now.getFullYear(),now.getMonth(),1);},e:function(){return new Date(now.getFullYear(),now.getMonth()+1,1);}},
          {id:'quarter',label:'Q'+Math.ceil((now.getMonth()+1)/3),s:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3,1);},e:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3+3,1);}},
          {id:'year',label:''+now.getFullYear(),s:function(){return new Date(now.getFullYear(),0,1);},e:function(){return new Date(now.getFullYear()+1,0,1);}},
          {id:'all',label:'All',isTotal:true,s:function(){return new Date(epoch);},e:function(){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);}},
          {id:'avg',label:'Avg/D',isAvg:true,s:function(){return new Date(epoch);},e:function(){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);}}
        ];
        // 2 rows: row1=4 charts, row2=3 charts
        var statsWrap=document.createElement('div');statsWrap.style.cssText='flex:1;display:flex;flex-direction:column;gap:3px;padding:2px 4px;overflow:hidden;min-height:0;';
        function makeStatsRow(rangeSlice){
          var sr=document.createElement('div');sr.style.cssText='display:flex;gap:3px;flex:1;min-height:0;';
          rangeSlice.forEach(function(rng){
            var sd=rng.s(),ed=rng.e();
            var dE=Math.max(1,Math.floor((Math.min(now.getTime(),ed.getTime())-sd.getTime())/86400000)+1);
            var sEvts=allEvS.filter(function(e){var es=new Date(e.start).getTime();return es>=sd.getTime()&&es<ed.getTime();});
            var aM={};sEvts.forEach(function(e){var cn=e.calendarName||'Other';if(!aM[cn])aM[cn]=0;aM[cn]+=(new Date(e.end).getTime()-new Date(e.start).getTime())/3600000;});
            var mx=1;cRows.forEach(function(r){if(r.type==='sep')return;var v=0;r.cals.forEach(function(cn){if(r.type==='plan')v+=rng.isAvg?(plan[cn]||0):(plan[cn]||0)*dE;else v+=rng.isAvg?(aM[cn]||0)/dE:(aM[cn]||0);});if(v>mx)mx=v;});
            var sc=document.createElement('div');sc.style.cssText='flex:1;background:'+bg2+';border-radius:4px;padding:3px 4px;display:flex;flex-direction:column;overflow:hidden;min-width:0;';
            var lb=document.createElement('div');lb.style.cssText='font-size:.45rem;font-weight:700;color:'+txt+';margin-bottom:2px;text-align:center;flex-shrink:0;';lb.textContent=rng.label+' ('+dE+'d)';sc.appendChild(lb);
            var rowsWrap=document.createElement('div');rowsWrap.style.cssText='flex:1;display:flex;flex-direction:column;justify-content:space-evenly;min-height:0;';
            cRows.forEach(function(r){
              if(r.type==='sep'){var sp=document.createElement('div');sp.style.cssText='height:1px;flex-shrink:0;';rowsWrap.appendChild(sp);return;}
              var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:2px;flex-shrink:0;';
              var rl=document.createElement('div');rl.style.cssText='width:40px;font-size:.35rem;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;opacity:.7;color:'+txt+';';rl.textContent=r.label;
              var bar=document.createElement('div');bar.style.cssText='flex:1;height:100%;min-height:6px;max-height:14px;background:'+(isDk?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)')+';border-radius:2px;overflow:hidden;display:flex;';
              var tot=0;r.cals.forEach(function(cn){var v=r.type==='plan'?(rng.isAvg?(plan[cn]||0):(plan[cn]||0)*dE):(rng.isAvg?(aM[cn]||0)/dE:(aM[cn]||0));if(v<=0)return;tot+=v;var sg=document.createElement('div');sg.style.cssText='height:100%;width:'+(v/mx*100)+'%;background:'+(cMap[cn]||(r.type==='plan'?'#888':'#4285f4'))+';';sg.title=cn+': '+v.toFixed(1)+'h';bar.appendChild(sg);});
              var rv=document.createElement('div');rv.style.cssText='font-size:.35rem;width:22px;text-align:left;opacity:.6;color:'+txt+';';rv.textContent=tot.toFixed(0);
              row.appendChild(rl);row.appendChild(bar);row.appendChild(rv);rowsWrap.appendChild(row);
            });
            sc.appendChild(rowsWrap);sr.appendChild(sc);
          });
          return sr;
        }
        statsWrap.appendChild(makeStatsRow(ranges.slice(0,4)));
        statsWrap.appendChild(makeStatsRow(ranges.slice(4)));
        root.appendChild(statsWrap);
        body.innerHTML='';body.appendChild(root);
      }catch(err){body.innerHTML='<div style="text-align:center;padding:10px;color:#e55;font-size:.5rem">\u26A0\uFE0F '+err.message+'</div>';}
    }

'@

$c = $before + $fn + $after
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== Zooper v16 Done ==="
