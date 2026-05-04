$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$s = "    async function _renderGantt2() {"
$e = "    async function _renderFruit() {"
$si = $c.IndexOf($s); $ei = $c.IndexOf($e)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL"; exit }
$before = $c.Substring(0, $si); $after = $c.Substring($ei)

$fn = @'
    async function _renderGantt2() {
      body.innerHTML='<div style="text-align:center;padding:10px;color:#888;font-size:.5rem">Loading...</div>';
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
      var sessions=[
        {start:0,tip:'\u062b\u0644\u062b \u0627\u0644\u0644\u064a\u0644 \u0627\u0644\u0622\u062e\u0631'},
        {start:4,tip:'\u062b\u0644\u062b \u0627\u0644\u0646\u0647\u0627\u0631 \u0627\u0644\u0623\u0648\u0644 (\u0648\u0642\u0631\u0622\u0646 \u0627\u0644\u0641\u062c\u0631)'},
        {start:8},{start:12},{start:16},{start:20}
      ];
      var LAYOUT=[
        {slot:0,fl:1},{slot:1,fl:1},{slot:2,fl:1},{type:'gap',fl:1},{slot:3,fl:1},
        {type:'div'},
        {slot:4,fl:2},{type:'gap',fl:2},{slot:5,fl:2},{slot:6,fl:2},{slot:7,fl:2}
      ];
      function toHijri(d){try{return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'short'}).format(d);}catch(e){return '';}}
      try{
        var allEv=await fetchCalendarEvents(sprintStart,sprintEnd);
        var evts=(allEv||[]).filter(function(e){return !e.allDay;});
        var fruitCalId='';
        try{var cals=await getCalendarList();var frCal=cals.find(function(c){return c.summary.toLowerCase()==="!40's fruit";});if(frCal)fruitCalId=frCal.id;}catch(e){}
        body._ganttRender=function(){_renderGantt2();};
        var bw=body.clientWidth-4,LW=48,DW=2;
        // 60 data + 10 gaps + 5 seps = 75 cells + 6 dividers
        var CS=Math.max(7,Math.floor((bw-LW-6*DW)/75));
        var dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var ct=document.createElement('div');
        ct.style.cssText='display:flex;flex-direction:column;height:100%;box-sizing:border-box;font-family:var(--font);overflow:hidden;padding:1px 2px;';
        var daysCt=document.createElement('div');
        daysCt.style.cssText='display:flex;flex-direction:column;flex:1;overflow:hidden;';
        for(var dayOff=0;dayOff<spDays;dayOff++){
          var dayDate=new Date(sprintStart);dayDate.setDate(sprintStart.getDate()+dayOff);
          var dayMs=new Date(dayDate.getFullYear(),dayDate.getMonth(),dayDate.getDate()).getTime();
          var dayEnd2=dayMs+86400000,isToday=(dayDate.toDateString()===now.toDateString()),isFuture=dayMs>todayD.getTime();
          var dayEvts=evts.filter(function(e){var es=new Date(e.start).getTime(),ee=new Date(e.end).getTime();return es<dayEnd2&&ee>dayMs;});
          var frSlotMap={};
          dayEvts.filter(function(e){return(e.calendarName||'').toLowerCase()==="!40's fruit";}).forEach(function(ev){var s2=new Date(ev.start).getTime(),e2=new Date(ev.end).getTime();var ss=Math.floor((s2-dayMs)/1800000),se=Math.ceil((e2-dayMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!frSlotMap[x])frSlotMap[x]=[];frSlotMap[x].push(ev);}}});
          function hasZS(sess,slots){for(var fi=0;fi<slots.length;fi++){var sm=(sess.start*60)+(slots[fi]*30),sx=sm+30;for(var ei=0;ei<dayEvts.length;ei++){var cn=(dayEvts[ei].calendarName||'').toLowerCase();if(cn!=='03g'&&cn!=='04g2')continue;var esM=new Date(dayEvts[ei].start).getHours()*60+new Date(dayEvts[ei].start).getMinutes();var eeM=new Date(dayEvts[ei].end).getHours()*60+new Date(dayEvts[ei].end).getMinutes();if(eeM===0)eeM=1440;if(esM<sx&&eeM>sm)return true;}}return false;}
          function isSlotFilled(sess,slot){var sm=(sess.start*60)+(slot*30),sx=sm+30;for(var i=0;i<dayEvts.length;i++){if((dayEvts[i].calendarName||'').toLowerCase()==="!40's fruit")continue;var esM=new Date(dayEvts[i].start).getHours()*60+new Date(dayEvts[i].start).getMinutes();var eeM=new Date(dayEvts[i].end).getHours()*60+new Date(dayEvts[i].end).getMinutes();if(eeM===0)eeM=1440;if(esM<sx&&eeM>sm)return true;}return false;}
          var dayFruitCount=0;for(var fk=0;fk<48;fk++){if((frSlotMap[fk]||[]).length>0)dayFruitCount++;}
          // Day row: [LABEL | cells] - single row, no fruit row
          var dw=document.createElement('div');
          dw.style.cssText='display:flex;align-items:stretch;flex:1;min-height:0;'+(isToday?'background:rgba(66,133,244,.07);':'')+(isFuture?'opacity:.3;':'')+(dayOff>0?'border-top:1px solid '+bdr+';':'');
          // Label cell
          var dl=document.createElement('div');
          dl.style.cssText='width:'+LW+'px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;line-height:1.4;border-right:1px solid '+bdr+';padding:0;margin:0;';
          var dg=document.createElement('span');dg.style.cssText='font-size:.65rem;font-weight:900;color:'+(isToday?'#4285f4':(isDk?'#ddd':'#111'))+';';dg.textContent=dn[dayDate.getDay()].substring(0,2)+' '+dayDate.getDate()+'/'+(dayDate.getMonth()+1);
          var dhj=document.createElement('span');dhj.style.cssText='font-size:.5rem;font-weight:800;color:#27ae60;';dhj.textContent=toHijri(dayDate);
          var dfs=document.createElement('span');dfs.style.cssText='font-size:.45rem;font-weight:700;color:'+(dayFruitCount>0?'#e74c3c':'rgba(128,128,128,.3)')+';';dfs.textContent='\uD83C\uDF4E'+dayFruitCount+'/16';
          dl.appendChild(dg);dl.appendChild(dhj);dl.appendChild(dfs);
          dw.appendChild(dl);
          var allCells=[];
          for(var si=0;si<6;si++){
            var sess=sessions[si];
            var f1z=hasZS(sess,[0,1,2,3]),f2z=hasZS(sess,[4,5,6,7]),sessOK=f1z&&f2z;
            var allFilled=true,anyFruit=false;
            for(var q=0;q<8;q++){if(!isSlotFilled(sess,q))allFilled=false;if((frSlotMap[si*8+q]||[]).length>0)anyFruit=true;}
            var sessDead=allFilled&&!anyFruit&&!f1z&&!f2z;
            var isSpec=(si===0||si===1);
            var sessClr=sessOK?'#27ae60':(isDk?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)');
            // Session separator - BRICK emoji, dead cell
            if(si>0){
              var sepEl=document.createElement('div');
              sepEl.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(5,CS-5))+'px;background:'+(isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)')+';';
              sepEl.textContent='\uD83E\uDDF1';
              dw.appendChild(sepEl);
            }
            // Session wrapper
            var sw=document.createElement('div');sw.style.cssText='display:flex;align-items:stretch;flex-shrink:0;outline:2px solid '+sessClr+';outline-offset:-2px;border-radius:2px;position:relative;'+(sessOK||isSpec?'background:rgba(39,174,96,'+(sessOK?'.06':'.08')+');':'');
            if(sess.tip)sw.title=sess.tip;
            LAYOUT.forEach(function(lc){
              if(lc.type==='div'){
                sw.appendChild(Object.assign(document.createElement('div'),{style:{cssText:'width:'+DW+'px;flex-shrink:0;background:'+(sessOK?'rgba(39,174,96,.2)':bdr)+';'}}));
                return;
              }
              if(lc.type==='gap'){
                var fz=lc.fl===1?f1z:f2z;
                var gp=document.createElement('div');gp.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(6,CS-4))+'px;background:rgba(128,128,128,.03);';
                if(fz){gp.textContent='\uD83C\uDF4C';}
                else{gp.textContent=sessDead?'\u2620\uFE0F':'\uD83E\uDD29';}
                sw.appendChild(gp);
                return;
              }
              var sIS=lc.slot,absSlot=si*8+sIS;
              var sMn=(sess.start*60)+(sIS*30),eMn=sMn+30;
              var sD=new Date(dayMs+sMn*60000),eD=new Date(dayMs+eMn*60000);
              var h1=Math.floor(sMn/60),m1=sMn%60,h2=Math.floor(eMn/60),m2=eMn%60;
              var tS=((h1%12)||12)+':'+(m1<10?'0':'')+m1+(h1<12?'am':'pm')+'\u2013'+((h2%12)||12)+':'+(m2<10?'0':'')+m2+(h2<12?'am':'pm');
              var sEvts=dayEvts.filter(function(e2){if((e2.calendarName||'').toLowerCase()==="!40's fruit")return false;var esM=new Date(e2.start).getHours()*60+new Date(e2.start).getMinutes();var eeM=new Date(e2.end).getHours()*60+new Date(e2.end).getMinutes();if(eeM===0)eeM=1440;return esM<eMn&&eeM>sMn;});
              var cBg='transparent',tip=tS;
              if(sEvts.length>0){cBg=sEvts[0].color||'#4285f4';tip=sEvts.map(function(e2){return(e2.summary||'')+' '+tS;}).join('\n');}
              var isNow=false;if(isToday){var nM=now.getHours()*60+now.getMinutes();if(nM>=sMn&&nM<eMn)isNow=true;}
              var hFr=(frSlotMap[absSlot]||[]).length>0;
              var isBr=(lc.slot===3||lc.slot===4);
              var timeLabel=m1===0?String((h1%12)||12):'30';
              // Cell = event + fruit merged
              var ec=document.createElement('div');ec.className='pomo-ev';
              ec.style.cssText='width:'+CS+'px;flex-shrink:0;position:relative;background:'+(cBg!=='transparent'?cBg:(isBr?'rgba(128,128,128,.06)':bg2))+';cursor:pointer;border-right:1px solid '+(isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)')+';display:flex;align-items:center;justify-content:center;'+(isNow?'outline:2px solid #ff6b35;outline-offset:-1px;animation:pomoPulse 1.5s infinite;z-index:1;':'');
              ec.title=tip+(hFr?' \uD83C\uDF4E':'');
              // Content: fruit emoji on top of time label
              if(hFr){
                var frSpan=document.createElement('span');frSpan.style.cssText='font-size:'+(Math.max(6,CS-4))+'px;pointer-events:none;';frSpan.textContent='\uD83C\uDF4E';ec.appendChild(frSpan);
              } else if(sEvts.length===0){
                var tl=document.createElement('span');tl.style.cssText='font-size:'+Math.min(CS-2,10)+'px;color:'+(isDk?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)')+';font-weight:'+(m1===0?'700':'400')+';pointer-events:none;';tl.textContent=timeLabel;ec.appendChild(tl);
              }
              // Left-click = edit/create event; Ctrl+click = toggle fruit
              (function(ec,se,sd,ed,as,hf,fsm,fci){
                ec.addEventListener('click',function(ev2){
                  ev2.stopPropagation();
                  if(ev2.ctrlKey||ev2.metaKey){
                    // Toggle fruit
                    if(!fci)return;
                    var fEvs=fsm[as]||[];
                    if(hf&&fEvs.length>0){deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id).then(function(){_renderGantt2();});}
                    else{createCalendarEvent(fci,"!40's Fruit",sd,ed,'').then(function(){_renderGantt2();});}
                  } else {
                    if(se.length>0){var e0=se[0];showCalendarEventForm(body,body,null,{mode:'edit',calendarId:e0.calendarId,eventId:e0.id,summary:e0.summary,description:e0.description,startTime:new Date(e0.start),endTime:new Date(e0.end)});}
                    else{showCalendarEventForm(body,body,null,{mode:'create',startTime:sd,endTime:ed});}
                  }
                });
              })(ec,sEvts,sD,eD,absSlot,hFr,frSlotMap,fruitCalId);
              sw.appendChild(ec);
              allCells.push({ev:ec,absSlot:absSlot,slotStartMin:sMn,slotEndMin:eMn,dayMs:dayMs});
            });
            // Watermark for special sessions
            if(isSpec&&sess.tip){var bgT=document.createElement('div');bgT.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:'+Math.max(6,CS-3)+'px;color:rgba(39,174,96,.18);font-weight:900;pointer-events:none;z-index:0;white-space:nowrap;overflow:hidden;';bgT.textContent=sess.tip;sw.appendChild(bgT);}
            dw.appendChild(sw);
          }
          // Drag-to-select (event create or ctrl+drag for fruit)
          (function(ac,dm,fci,fsm){
            var mode=null,si2=-1,isCtrl=false;
            function gCA(x,y){for(var i=0;i<ac.length;i++){var r=ac[i].ev.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return i;}return-1;}
            function hl(a,b){ac.forEach(function(c,i){c.ev.style.outline=(i>=a&&i<=b)?'2px solid '+(isCtrl?'#e74c3c':'#4285f4'):'none';});}
            function clr(){ac.forEach(function(c){c.ev.style.outline='none';});}
            ac.forEach(function(c,i){
              c.ev.addEventListener('mousedown',function(e){if(e.button!==0)return;mode='ev';si2=i;isCtrl=e.ctrlKey||e.metaKey;hl(i,i);e.preventDefault();});
            });
            document.addEventListener('mousemove',function(e){if(!mode)return;var h=gCA(e.clientX,e.clientY);if(h<0)return;hl(Math.min(si2,h),Math.max(si2,h));});
            document.addEventListener('mouseup',function(){
              if(!mode)return;mode=null;
              var sel=[];ac.forEach(function(c){if(c.ev.style.outline&&c.ev.style.outline!=='none')sel.push(c);});clr();
              if(isCtrl&&sel.length>=1&&fci){
                // Ctrl+drag: toggle fruit on selected cells
                var hc=sel.filter(function(c2){return(fsm[c2.absSlot]||[]).length>0;}).length;
                var doDelete=hc>sel.length/2;
                var ops=[];
                sel.forEach(function(c2){var fEvs=fsm[c2.absSlot]||[];
                  if(doDelete&&fEvs.length>0)ops.push(deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id));
                  else if(!doDelete&&fEvs.length===0)ops.push(createCalendarEvent(fci,"!40's Fruit",new Date(dm+c2.slotStartMin*60000),new Date(dm+c2.slotEndMin*60000),''));
                });
                if(ops.length)Promise.all(ops).then(function(){_renderGantt2();}).catch(function(){_renderGantt2();});
              } else if(!isCtrl&&sel.length>=2){
                var sMin=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));
                var eMin=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));
                showCalendarEventForm(body,body,null,{mode:'create',startTime:new Date(dm+sMin*60000),endTime:new Date(dm+eMin*60000)});
              }
            });
          })(allCells,dayMs,fruitCalId,frSlotMap);
          daysCt.appendChild(dw);
        }
        ct.appendChild(daysCt);body.innerHTML='';body.appendChild(ct);
      }catch(err){body.innerHTML='<div style="text-align:center;padding:10px;color:#e55;font-size:.5rem">\u26A0\uFE0F '+err.message+'</div>';}
    }

'@

$c = $before + $fn + $after
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== v11 Done ==="
