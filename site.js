(() => {
  const field=document.querySelector('#publication-search');
  const controls=document.querySelector('.pub-controls');
  if(!field||!controls)return;
  const rows=[...document.querySelectorAll('.publication')];
  const groups=[...document.querySelectorAll('.pub-group')];
  const status=document.querySelector('#search-status');
  const empty=document.querySelector('#no-results');
  controls.hidden=false;
  field.addEventListener('input',()=>{
    const query=field.value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    let count=0;
    for(const row of rows){
      const text=row.textContent.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const match=query.split(/\s+/).every(word=>text.includes(word));
      row.hidden=!match;if(match)count++;
    }
    for(const group of groups)group.hidden=![...group.querySelectorAll('.publication')].some(row=>!row.hidden);
    empty.hidden=count!==0;
    status.textContent=`${count} publication${count===1?'':'s'} found.`;
  });
})();
