$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

$startMark = "    async function _renderGantt2() {"
$endMark = "    async function _renderFruit() {"
$si = $c.IndexOf($startMark)
$ei = $c.IndexOf($endMark)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL"; exit }
$before = $c.Substring(0, $si)
$after = $c.Substring($ei)

$fn = @'
    async function _renderGantt2() {
      body.innerHTML = '<div style="text-align:center;padding:10px;color:#888;font-size:.5rem">Loading Sprint...</div>';
      if (!document.getElementById('pomo-pulse-css')) { var sty=document.createElement('style');sty.id='pomo-pulse-css';sty.textContent='@keyframes pomoPulse{0%,100%{box-shadow:0 0 3px rgba(255,107,53,.4)}50%{box-shadow:0 0 8px rgba(255,107,53,.8)}}';document.head.appendChild(sty); }
      var now=new Date(), isDk=_state.theme!=='light';
      var txt=isDk?'#ddd':'#222', bg2=isDk?'rgba(255,255,255,.03)':'rgba(0,0,0,.02)', bdr=isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';
      var sprintOff=_state.offset||0, todayD=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      var sprintStart=new Date(todayD); sprintStart.setDate(todayD.getDate()-todayD.getDay()+(sprintOff*14));
      var sprintEnd=new Date(sprintStart); sprintEnd.setDate(sprintStart.getDate()+14);
      var sessions=[
        {name:'12a\u20134a',emoji:'\uD83C\uDF19',start:0,end:4},
        {name:'4a\u20138a',emoji:'\uD83C\uDF05',start:4,end:8},
        {name:'8a\u201312p',emoji:'\u2600\uFE0F',start:8,end:12},
        {name:'12p\u20134p',emoji:'\uD83D\uDD25',start:12,end:16},
        {name:'4p\u20138p',emoji:'\uD83C\uDF06',start:16,end:20},
        {name:'8p\u201312a',emoji:'\uD83C\uDF19',start:20,end:24}
      ];
      function toHijri(d) { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'short'}).format(d); } catch(e) { return ''; } }
      function timeStr(mins) { var h=Math.floor(mins/60),m=mins%60; return ((h%12)||12)+':'+(m<10?'0':'')+m+(h<12?'am':'pm'); }
      try {
        var allEv=await fetchCalendarEvents(sprintStart,sprintEnd);
        var evts=(allEv||[]).filter(function(e){return !e.allDay;});
        var fruitCalId='';
        try{var cals=await getCalendarList();var frCal=cals.find(function(c2){return c2.summary.toLowerCase()==="!40's fruit";});if(frCal)fruitCalId=frCal.id;}catch(e){}
        body._ganttRender=function(){_renderGantt2();};
        var bw=body.clientWidth-8, bh=body.clientHeight-4;
        var LABEL_W=52, BADGE_W=20, SESS_GAP=8, FLIGHT_DIV=3;
        var totalFixed=LABEL_W+BADGE_W+(5*SESS_GAP)+(6*FLIGHT_DIV);
        var CS=Math.max(8,Math.floor((bw-totalFixed)/(6*10)));
        var HDR_H=18;
        var dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var ct=document.createElement('div');
        ct.style.cssText='display:flex;flex-direction:column;height:100%;box-sizing:border-box;font-family:var(--font);overflow:hidden;padding:2px 4px;';
        // Header
        var hdr=document.createElement('div');
        hdr.style.cssText='display:flex;align-items:center;height:'+HDR_H+'px;flex-shrink:0;border-bottom:2px solid '+bdr+';margin-bottom:1px;';
        var hl=document.createElement('div');hl.style.cssText='width:'+LABEL_W+'px;flex-shrink:0;';hdr.appendChild(hl);
        sessions.forEach(function(s,si){
          if(si>0){var g=document.createElement('div');g.style.cssText='width:'+SESS_GAP+'px;flex-shrink:0;';hdr.appendChild(g);}
          var sw=CS*10+FLIGHT_DIV;
          var sl=document.createElement('div');
          sl.style.cssText='width:'+sw+'px;text-align:center;font-size:.38rem;color:'+txt+';flex-shrink:0;font-weight:700;';
          sl.textContent=s.emoji+' '+s.name;
          hdr.appendChild(sl);
        });
        ct.appendChild(hdr);
        var daysCt=document.createElement('div');
        daysCt.style.cssText='display:flex;flex-direction:column;flex:1;gap:0;overflow:hidden;';
        for(var dayOff=0;dayOff<14;dayOff++){
          var dayDate=new Date(sprintStart);dayDate.setDate(sprintStart.getDate()+dayOff);
          var dayMs=new Date(dayDate.getFullYear(),dayDate.getMonth(),dayDate.getDate()).getTime();
          var dayEnd2=dayMs+86400000;
          var isToday=(dayDate.toDateString()===now.toDateString());
          var isFuture=dayMs>todayD.getTime();
          var dayEvts=evts.filter(function(e){var es=new Date(e.start).getTime(),ee=new Date(e.end).getTime();return es<dayEnd2&&ee>dayMs;});
          var frSlotMap={};
          dayEvts.filter(function(e){return(e.calendarName||'').toLowerCase()==="!40's fruit";}).forEach(function(ev){var s2=new Date(ev.start).getTime(),e2=new Date(ev.end).getTime();var ss=Math.floor((s2-dayMs)/1800000),se=Math.ceil((e2-dayMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!frSlotMap[x])frSlotMap[x]=[];frSlotMap[x].push(ev);}}});
          function hasZS(sess,slots){for(var fi=0;fi<slots.length;fi++){var sm2=(sess.start*60)+(slots[fi]*30),sx=sm2+30;for(var ei3=0;ei3<dayEvts.length;ei3++){var cn=(dayEvts[ei3].calendarName||'').toLowerCase();if(cn!=='03g'&&cn!=='04g2')continue;var esM=new Date(dayEvts[ei3].start).getHours()*60+new Date(dayEvts[ei3].start).getMinutes();var eeM=new Date(dayEvts[ei3].end).getHours()*60+new Date(dayEvts[ei3].end).getMinutes();if(eeM===0)eeM=1440;if(esM<sx&&eeM>sm2)return true;}}return false;}
          var dw=document.createElement('div');
          dw.style.cssText='display:flex;flex-direction:column;flex:1;min-height:0;'+(isToday?'background:rgba(66,133,244,.06);':'')+(isFuture?'opacity:.3;':'')+(dayOff>0?'border-top:1px solid '+bdr+';':'');
          var r1=document.createElement('div');r1.style.cssText='display:flex;align-items:stretch;flex:1;min-height:0;';
          var r2=document.createElement('div');r2.style.cssText='display:flex;align-items:stretch;flex:1;min-height:0;';
          // Day label with Hijri
          var dl=document.createElement('div');
          dl.style.cssText='width:'+LABEL_W+'px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;padding-right:3px;flex-shrink:0;line-height:1.1;';
          var dg=document.createElement('span');dg.style.cssText='font-size:.42rem;font-weight:800;color:'+(isToday?'#4285f4':'#222')+';';dg.textContent=dn[dayDate.getDay()].substring(0,2)+' '+dayDate.getDate()+'/'+(dayDate.getMonth()+1);
          var dh=document.createElement('span');dh.style.cssText='font-size:.35rem;font-weight:700;color:#27ae60;';dh.textContent=toHijri(dayDate);
          dl.appendChild(dg);dl.appendChild(dh);
          r1.appendChild(dl);
          var dl2=document.createElement('div');dl2.style.cssText='width:'+LABEL_W+'px;flex-shrink:0;';r2.appendChild(dl2);
          var allCells=[];
          sessions.forEach(function(sess,si){
            var f1z=hasZS(sess,[0,1,2,3]),f2z=hasZS(sess,[4,5,6,7]),sessOK=f1z&&f2z;
            var sessBdr=sessOK?'3px solid #27ae60':'2px solid '+(isDk?'rgba(255,255,255,.2)':'rgba(0,0,0,.18)');
            if(si>0){r1.appendChild(Object.assign(document.createElement('div'),{style:{cssText:'width:'+SESS_GAP+'px;flex-shrink:0;background:'+(isDk?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)')+';'}}));r2.appendChild(Object.assign(document.createElement('div'),{style:{cssText:'width:'+SESS_GAP+'px;flex-shrink:0;'}}));}
            // Session wrappers with thick borders
            var sw1=document.createElement('div');sw1.style.cssText='display:flex;align-items:stretch;border:'+sessBdr+';flex-shrink:0;border-radius:2px;'+(sessOK?'background:rgba(39,174,96,.04);':'');
            var sw2=document.createElement('div');sw2.style.cssText='display:flex;align-items:stretch;border-left:'+sessBdr+';border-right:'+sessBdr+';border-bottom:'+sessBdr+';flex-shrink:0;border-radius:0 0 2px 2px;';
            // Flight border colors
            var f1Bdr=f1z?'border-right:2px solid #27ae60;':'border-right:1px solid '+bdr+';';
            var f2Bdr='';
            // Build layout: F1=[W0 W1 W2 gap B3] | F2=[B4 gap W5 W6 W7]
            var layout=[
              {slot:0,type:'w',flight:1},{slot:1,type:'w',flight:1},{slot:2,type:'w',flight:1},{slot:-1,type:'gap',flight:1},{slot:3,type:'b',flight:1},
              {slot:-2,type:'div'},
              {slot:4,type:'b',flight:2},{slot:-1,type:'gap',flight:2},{slot:5,type:'w',flight:2},{slot:6,type:'w',flight:2},{slot:7,type:'w',flight:2}
            ];
            layout.forEach(function(lc){
              if(lc.type==='div'){
                var dv1=document.createElement('div');dv1.style.cssText='width:'+FLIGHT_DIV+'px;background:'+(f1z||f2z?'rgba(39,174,96,.25)':bdr)+';flex-shrink:0;'+f1Bdr;
                sw1.appendChild(dv1);
                var dv2=document.createElement('div');dv2.style.cssText='width:'+FLIGHT_DIV+'px;flex-shrink:0;'+f1Bdr;
                sw2.appendChild(dv2);
                return;
              }
              if(lc.type==='gap'){
                // Event row gap: skull if no zakat
                var fz2=lc.flight===1?f1z:f2z;
                var gp1=document.createElement('div');gp1.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(7,CS-4))+'px;background:rgba(128,128,128,.03);';
                if(!fz2) gp1.textContent='\u2620\uFE0F';
                sw1.appendChild(gp1);
                // Fruit row gap: banana if zakat
                var gp2=document.createElement('div');gp2.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(7,CS-4))+'px;';
                if(fz2) gp2.textContent='\uD83C\uDF4C';
                sw2.appendChild(gp2);
                return;
              }
              var slotInSess=lc.slot, absSlot=si*8+slotInSess;
              var slotStartMin=(sess.start*60)+(slotInSess*30), slotEndMin=slotStartMin+30;
              var slotStartDate=new Date(dayMs+slotStartMin*60000), slotEndDate=new Date(dayMs+slotEndMin*60000);
              var slotEvts=dayEvts.filter(function(e2){if((e2.calendarName||'').toLowerCase()==="!40's fruit")return false;var esM=new Date(e2.start).getHours()*60+new Date(e2.start).getMinutes();var eeM=new Date(e2.end).getHours()*60+new Date(e2.end).getMinutes();if(eeM===0)eeM=1440;return esM<slotEndMin&&eeM>slotStartMin;});
              var cellBg='transparent',tooltip=timeStr(slotStartMin)+' \u2013 '+timeStr(slotEndMin);
              if(slotEvts.length>0){cellBg=slotEvts[0].color||'#4285f4';tooltip=slotEvts.map(function(e2){return(e2.summary||'')+' ('+timeStr(slotStartMin)+')';}).join('\n');}
              var isNow=false;if(isToday){var nowMin=now.getHours()*60+now.getMinutes();if(nowMin>=slotStartMin&&nowMin<slotEndMin)isNow=true;}
              var hasFruit=(frSlotMap[absSlot]||[]).length>0;
              var ec=document.createElement('div');ec.className='pomo-ev';
              ec.style.cssText='width:'+CS+'px;flex-shrink:0;background:'+(cellBg!=='transparent'?cellBg:(lc.type==='b'?'rgba(128,128,128,.06)':bg2))+';cursor:pointer;border-right:1px solid rgba(128,128,128,.06);'+(isNow?'outline:2px solid #ff6b35;outline-offset:-1px;animation:pomoPulse 1.5s infinite;z-index:1;':'');
              ec.title=tooltip;
              (function(ec,slotEvts,slotStartDate,slotEndDate){ec.addEventListener('click',function(ev2){ev2.stopPropagation();if(slotEvts.length>0){var e0=slotEvts[0];showCalendarEventForm(body,body,null,{mode:'edit',calendarId:e0.calendarId,eventId:e0.id,summary:e0.summary,description:e0.description,startTime:new Date(e0.start),endTime:new Date(e0.end)});}else{showCalendarEventForm(body,body,null,{mode:'create',startTime:slotStartDate,endTime:slotEndDate});}});})(ec,slotEvts,slotStartDate,slotEndDate);
              sw1.appendChild(ec);
              var fc=document.createElement('div');fc.className='pomo-fr';
              fc.style.cssText='width:'+CS+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(7,CS-4))+'px;cursor:pointer;background:'+(hasFruit?'rgba(231,76,60,.08)':'transparent')+';border-right:1px solid rgba(128,128,128,.03);';
              fc.textContent=hasFruit?'\uD83C\uDF4E':'';
              fc.title=timeStr(slotStartMin)+(hasFruit?' \u2714':'');
              (function(fc,absSlot,hasFruit,frSlotMap,fruitCalId,slotStartDate,slotEndDate){fc.addEventListener('click',function(ev2){ev2.stopPropagation();if(!fruitCalId)return;var fEvs=frSlotMap[absSlot]||[];if(hasFruit&&fEvs.length>0){deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id).then(function(){_renderGantt2();});}else{createCalendarEvent(fruitCalId,"!40's Fruit",slotStartDate,slotEndDate,'').then(function(){_renderGantt2();});}});})(fc,absSlot,hasFruit,frSlotMap,fruitCalId,slotStartDate,slotEndDate);
              sw2.appendChild(fc);
              allCells.push({ev:ec,fr:fc,absSlot:absSlot,slotStartMin:slotStartMin,slotEndMin:slotEndMin,dayMs:dayMs});
            });
            r1.appendChild(sw1);r2.appendChild(sw2);
          });
          var bd=document.createElement('div');bd.style.cssText='width:'+BADGE_W+'px;flex-shrink:0;display:flex;align-items:center;gap:0;font-size:7px;padding-left:1px;';
          var dayFZ=0,daySZ=0;sessions.forEach(function(sess){var f1=hasZS(sess,[0,1,2,3]),f2=hasZS(sess,[4,5,6,7]);if(f1)dayFZ++;if(f2)dayFZ++;if(f1&&f2)daySZ++;});
          if(daySZ>0){var b2=document.createElement('span');b2.textContent='\uD83C\uDF49';b2.style.fontSize='6px';bd.appendChild(b2);}
          r1.appendChild(bd);
          // Drag
          (function(allCells,dayMs,fruitCalId,frSlotMap){var mode=null,startIdx=-1;function gCA(x,y){for(var i=0;i<allCells.length;i++){var tgt=mode==='ev'?allCells[i].ev:allCells[i].fr;var r=tgt.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return i;}return -1;}function hl(a,b){allCells.forEach(function(c,i){var t=mode==='ev'?c.ev:c.fr;t.style.outline=(i>=a&&i<=b)?'2px solid '+(mode==='ev'?'#4285f4':'#e74c3c'):'none';});}function clr(){allCells.forEach(function(c){c.ev.style.outline='none';c.fr.style.outline='none';});}allCells.forEach(function(c,i){c.ev.addEventListener('mousedown',function(e){if(e.button!==0)return;mode='ev';startIdx=i;hl(i,i);e.preventDefault();});c.fr.addEventListener('mousedown',function(e){if(e.button!==0)return;mode='fr';startIdx=i;hl(i,i);e.preventDefault();});});document.addEventListener('mousemove',function(e){if(!mode)return;var h=gCA(e.clientX,e.clientY);if(h<0)return;hl(Math.min(startIdx,h),Math.max(startIdx,h));});document.addEventListener('mouseup',function(){if(!mode)return;var cm=mode;mode=null;var sel=[];allCells.forEach(function(c){var t=cm==='ev'?c.ev:c.fr;if(t.style.outline&&t.style.outline!=='none')sel.push(c);});clr();if(cm==='ev'&&sel.length>=2){var sMin=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));var eMin=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));showCalendarEventForm(body,body,null,{mode:'create',startTime:new Date(dayMs+sMin*60000),endTime:new Date(dayMs+eMin*60000)});}else if(cm==='fr'&&sel.length>=2&&fruitCalId){var hc=sel.filter(function(c2){return(frSlotMap[c2.absSlot]||[]).length>0;}).length;var dl3=hc>sel.length/2;var ops=[];sel.forEach(function(c2){var fEvs=frSlotMap[c2.absSlot]||[];if(dl3&&fEvs.length>0)ops.push(deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id));else if(!dl3&&fEvs.length===0)ops.push(createCalendarEvent(fruitCalId,"!40's Fruit",new Date(dayMs+c2.slotStartMin*60000),new Date(dayMs+c2.slotEndMin*60000),''));});if(ops.length)Promise.all(ops).then(function(){_renderGantt2();}).catch(function(){_renderGantt2();});}});
          })(allCells,dayMs,fruitCalId,frSlotMap);
          dw.appendChild(r1);dw.appendChild(r2);daysCt.appendChild(dw);
        }
        ct.appendChild(daysCt);body.innerHTML='';body.appendChild(ct);
      }catch(err){body.innerHTML='<div style="text-align:center;padding:10px;color:#e55;font-size:.5rem">\u26A0\uFE0F '+err.message+'</div>';}
    }

'@

$c = $before + $fn + $after
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "Done: Gantt2 v5"
