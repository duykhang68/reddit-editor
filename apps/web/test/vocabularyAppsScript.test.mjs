import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../apps-script/VocabularyAiAutofill.gs',import.meta.url),'utf8');
function harness({props={},post}={}) {
  const values={...props};
  const mockProps={
    getProperty:k=>values[k]??null,
    setProperty:(k,v)=>{values[k]=v;},
    setProperties:obj=>Object.assign(values,obj)
  };
  const context={
    UrlFetchApp:{fetch:(url,options)=>post(url,options)},
    PropertiesService:{getScriptProperties:()=>mockProps},
    console:{error(){}},
    Logger:{log(){}},
    Date,JSON,String,Number,Math,Error,Boolean,Object,Array,RegExp,
  };
  vm.runInNewContext(source+'\nthis.api={vocabularyAiParse_, vocabularyAiGenerate_, processVocabularyAiLocked_};',context);
  return {...context.api,props:values,mockProps};
}
const good={
  context:'Dùng trong cuộc trò chuyện hằng ngày.',
  grammar:'VI: Xin chào bạn. KR: 안녕하세요. EN: Hello.'
};
test('rejects incomplete generated grammar and JSON',()=>{
  const h=harness({post:()=>{}});
  assert.throws(()=>h.vocabularyAiParse_('{invalid}'),/valid JSON/);
  assert.throws(()=>h.vocabularyAiParse_(JSON.stringify({...good,category:'General',grammar:'No examples'})),/VI:/);
});
test('uses Gemini before Groq when Gemini response is valid',()=>{
  const urls=[];
  const h=harness({
    props:{GEMINI_API_KEY:'test',GROQ_API_KEY:'test'},
    post:(url,options)=>{
      urls.push(url);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({
        candidates:[{content:{parts:[{text:JSON.stringify({...good,category:'General'})}]}}]
      })};
    }
  });
  const result=h.vocabularyAiGenerate_({vi:'Xin chào',ko:'안녕하세요',en:'Hello'});
  assert.match(result.provider,/^Gemini/);
  assert.equal(urls.length,1);
  assert.match(urls[0],/generativelanguage.googleapis.com/);
});
test('falls back to Groq after Gemini models fail',()=>{
  const urls=[];
  const h=harness({
    props:{GEMINI_API_KEY:'test',GROQ_API_KEY:'test',GEMINI_MODELS:'model-a,model-b'},
    post:(url,options)=>{
      urls.push(url);
      if(url.includes('generativelanguage'))return {getResponseCode:()=>429,getContentText:()=>'{"error":"quota"}'};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({
        choices:[{message:{content:JSON.stringify({...good,category:'General'})}}]
      })};
    }
  });
  const result=h.vocabularyAiGenerate_({vi:'Xin chào',ko:'안녕하세요',en:'Hello'});
  assert.match(result.provider,/^Groq/);
  assert.equal(urls.length,3);
  assert.match(urls[2],/api.groq.com/);
});
test('autofill does not overwrite existing D or F',()=>{
  const sheetRows=[['Việt','Hàn','Anh','Context or Expression','Ngữ pháp ví dụ','Category'],
    ['Xin chào','안녕하세요','Hello','Existing context','','Existing category']];
  const sheet={
    getLastRow:()=>2,
    getRange:(row,col,height=1,width=1)=>({
      getValues:()=>Array.from({length:height},(_,i)=>sheetRows[row+i-1].slice(col-1,col+width)),
      getDisplayValues:()=>Array.from({length:height},(_,i)=>sheetRows[row+i-1].slice(col-1,col+width)),
      getFormulas:()=>Array.from({length:height},()=>Array(width).fill('')),
      setValue:value=>{sheetRows[row-1][col-1]=value;}
    }),
    getSheetId:()=>0
  };
  const h=harness({
    props:{VOCAB_AI_CURSOR:'2',VOCAB_AI_DIRTY:'1',GROQ_API_KEY:'test'},
    post:(url,options)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({
      choices:[{message:{content:JSON.stringify({...good,category:'Generated category'})}}]
    })})
  });
  // Inject fake bound spreadsheet.
  const context={
    UrlFetchApp:{fetch:(url,options)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({
      choices:[{message:{content:JSON.stringify({...good,category:'Generated category'})}}]
    })})},
    PropertiesService:{getScriptProperties:()=>h.mockProps},
    SpreadsheetApp:{openById:()=>({getSheets:()=>[sheet]})},
    console:{error(){}},Logger:{log(){}},
  };
  vm.runInNewContext(source+'\nthis.run=processVocabularyAiLocked_;',context);
  context.run(h.mockProps);
  assert.equal(sheetRows[1][3],'Existing context');
  assert.equal(sheetRows[1][4],good.grammar);
  assert.equal(sheetRows[1][5],'Existing category');
});

test('new A-C edits queue urgent rows without rewinding the backlog cursor',()=>{
  const values={VOCAB_AI_CURSOR:'2',VOCAB_AI_DIRTY:'1'};
  const props={getProperty:k=>values[k]??null,setProperties:obj=>Object.assign(values,obj)};
  const lock={tryLock:()=>true,releaseLock:()=>{}};
  const context={
    PropertiesService:{getScriptProperties:()=>props},
    LockService:{getScriptLock:()=>lock}
  };
  vm.runInNewContext(source+'\nthis.onEdit=vocabularyAiOnEdit;',context);
  context.onEdit({range:{
    getSheet:()=>({getSheetId:()=>0}),getColumn:()=>1,getLastColumn:()=>3,
    getRow:()=>1444,getLastRow:()=>1444
  }});
  assert.equal(values.VOCAB_AI_CURSOR,'2');
  assert.equal(values.VOCAB_AI_PRIORITY_START,'1444');
  assert.equal(values.VOCAB_AI_PRIORITY_END,'1444');
  context.onEdit({range:{
    getSheet:()=>({getSheetId:()=>0}),getColumn:()=>2,getLastColumn:()=>3,
    getRow:()=>1500,getLastRow:()=>1502
  }});
  assert.equal(values.VOCAB_AI_PRIORITY_START,'1444');
  assert.equal(values.VOCAB_AI_PRIORITY_END,'1502');
});
