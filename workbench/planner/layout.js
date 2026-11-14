(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DuoPlannerLayout=api})(globalThis,function(){
 'use strict';
 function layout(width,focus='tasks'){
   focus=focus==='memo'?'memo':'tasks';
   if(Number(width)>=700)return{mode:'spread',focus,columns:'minmax(0,1fr) minmax(0,1fr)',collapsed:null};
   return{mode:'compact',focus,columns:focus==='tasks'?'minmax(0,9fr) minmax(44px,1fr)':'minmax(44px,1fr) minmax(0,9fr)',collapsed:focus==='tasks'?'memo':'tasks'};
 }
 return{layout};
});
