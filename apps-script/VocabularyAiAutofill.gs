/**
 * VI–KO–EN vocabulary autofill for spreadsheet 19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk.
 * Paste this ENTIRE file in the spreadsheet's bound Apps Script editor.
 * Never put API keys in source. Set Script properties GEMINI_API_KEY and GROQ_API_KEY.
 *
 * Input: A Việt | B Hàn | C Anh.
 * Fill only empty D Context | E Ngữ pháp ví dụ | F Category.
 * An installable edit trigger queues pasted rows; a time trigger processes
 * small batches so pasting hundreds of rows will not exceed execution limits.
 */

const VOCAB_AI_CONFIG = Object.freeze({
  spreadsheetId: '19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk',
  sheetId: 0,
  header: ['Việt', 'Hàn', 'Anh', 'Context or Expression', 'Ngữ pháp ví dụ', 'Category'],
  maximumRowsPerRun: 3,
  maximumScannedPerRun: 500,
  defaultGeminiModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'],
  defaultGroqModel: 'qwen/qwen3.8-27b'
});

const VOCAB_STATE = {
  cursor: 'VOCAB_AI_CURSOR',
  dirty: 'VOCAB_AI_DIRTY',
  nextAttempt: 'VOCAB_AI_NEXT_ATTEMPT',
  processed: 'VOCAB_AI_PROCESSED',
  errors: 'VOCAB_AI_ERRORS',
  lastError: 'VOCAB_AI_LAST_ERROR',
  lastSuccess: 'VOCAB_AI_LAST_SUCCESS',
  lastProvider: 'VOCAB_AI_LAST_PROVIDER',
  lastSweep: 'VOCAB_AI_LAST_SWEEP',
  priorityStart: 'VOCAB_AI_PRIORITY_START',
  priorityEnd: 'VOCAB_AI_PRIORITY_END'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧠 Vocabulary AI')
    .addItem('Cài trigger tự động', 'installVocabularyAiTriggers')
    .addItem('Quét lại các cột D–F còn trống', 'queueAllVocabularyAi')
    .addItem('Xử lý ngay một đợt', 'processVocabularyAiQueue')
    .addItem('Xem trạng thái', 'showVocabularyAiStatus')
    .addToUi();
}

function vocabularySheet_() {
  const book = SpreadsheetApp.openById(VOCAB_AI_CONFIG.spreadsheetId);
  const sheet = book.getSheets().find(s => s.getSheetId() === VOCAB_AI_CONFIG.sheetId);
  if (!sheet) throw new Error('Không tìm thấy tab gid=0. Kiểm tra Sheet ID.');
  const headers = sheet.getRange(1, 1, 1, 6).getDisplayValues()[0];
  VOCAB_AI_CONFIG.header.forEach((expected, i) => {
    if (String(headers[i]).trim().toLowerCase() !== expected.toLowerCase()) {
      throw new Error('Cột ' + (i + 1) + ' phải có tiêu đề ' + expected + ', hiện là: ' + headers[i]);
    }
  });
  return sheet;
}

/** Run ONCE from Apps Script editor to install the triggers. */
function installVocabularyAiTriggers() {
  vocabularySheet_();
  const spreadsheet = SpreadsheetApp.openById(VOCAB_AI_CONFIG.spreadsheetId);
  const handlers = ['vocabularyAiOnEdit', 'processVocabularyAiQueue'];
  ScriptApp.getProjectTriggers().filter(t => handlers.includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('vocabularyAiOnEdit').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('processVocabularyAiQueue').timeBased().everyMinutes(1).create();
  queueAllVocabularyAi();
  Logger.log('Installed edit + 1-minute worker triggers. Initial scan is queued.');
}

/** Does not call Gemini/Groq from an onEdit trigger. Safe for multi-row paste. */
function vocabularyAiOnEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  if (range.getSheet().getSheetId() !== VOCAB_AI_CONFIG.sheetId) return;
  if (range.getLastColumn() < 1 || range.getColumn() > 3 || range.getLastRow() < 2) return;
  const firstRow = Math.max(2, range.getRow());
  const props = PropertiesService.getScriptProperties();
  // This is a hint, not the only discovery mechanism: the minute worker also
  // does periodic full scanning to recover from missed concurrent edit events.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return;
  try {
    // Keep the full-scan cursor intact: new edits must be processed first.
    const oldStart = Number(props.getProperty(VOCAB_STATE.priorityStart)) || firstRow;
    const oldEnd = Number(props.getProperty(VOCAB_STATE.priorityEnd)) || range.getLastRow();
    props.setProperties({
      [VOCAB_STATE.priorityStart]: String(Math.min(oldStart, firstRow)),
      [VOCAB_STATE.priorityEnd]: String(Math.max(oldEnd, range.getLastRow())),
      [VOCAB_STATE.dirty]: '1',
      [VOCAB_STATE.nextAttempt]: '0'
    });
  } finally { lock.releaseLock(); }
}

function queueAllVocabularyAi() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    [VOCAB_STATE.cursor]: '2',
    [VOCAB_STATE.priorityStart]: '0',
    [VOCAB_STATE.priorityEnd]: '0',
    [VOCAB_STATE.dirty]: '1',
    [VOCAB_STATE.nextAttempt]: '0'
  });
  Logger.log('Queued a complete scan of rows 2 onward.');
}

function processVocabularyAiQueue() {
  const props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty(VOCAB_STATE.nextAttempt) || 0) > Date.now()) {
    Logger.log('Vocabulary AI đang tạm dừng sau lỗi; dùng menu Xem trạng thái để đọc LAST_ERROR.');
    return;
  }
  const lastSweep = Number(props.getProperty(VOCAB_STATE.lastSweep) || 0);
  if (props.getProperty(VOCAB_STATE.dirty) !== '1' && Date.now() - lastSweep < 6 * 60 * 60 * 1000) {
    Logger.log('Vocabulary AI: không có dòng mới trong hàng chờ.');
    return;
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {Logger.log('Vocabulary AI: lượt khác đang xử lý; bỏ qua lượt trùng.'); return;}
  try {
    processVocabularyAiLocked_(props);
  } catch (error) {
    const message = String(error && error.message || error).slice(0, 300);
    props.setProperties({
      [VOCAB_STATE.errors]: String(Number(props.getProperty(VOCAB_STATE.errors) || 0) + 1),
      [VOCAB_STATE.lastError]: new Date().toISOString() + ' · ' + message,
      [VOCAB_STATE.nextAttempt]: String(Date.now() + 10 * 60 * 1000),
      [VOCAB_STATE.dirty]: '1'
    });
    console.error('Vocabulary AI: ' + message);
  } finally { lock.releaseLock(); }
}

function processVocabularyAiLocked_(props) {
  const sheet = vocabularySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { props.setProperties({[VOCAB_STATE.dirty]: '0', [VOCAB_STATE.lastSweep]: String(Date.now())}); return; }

  const priorityStart = Number(props.getProperty(VOCAB_STATE.priorityStart)) || 0;
  const priorityEnd = Number(props.getProperty(VOCAB_STATE.priorityEnd)) || 0;
  const urgent = priorityStart >= 2 && priorityEnd >= priorityStart;
  const scanEnd = urgent ? Math.min(lastRow, priorityEnd) : lastRow;
  let cursor = urgent ? priorityStart : Math.max(2, Number(props.getProperty(VOCAB_STATE.cursor)) || 2);
  if (cursor > lastRow && !urgent) cursor = 2;
  let scanned = 0, completed = 0;
  Logger.log('Vocabulary AI scan: ' + (urgent ? 'priority' : 'backlog') + ', start=' + cursor + ', end=' + scanEnd);

  while (cursor <= scanEnd &&
      scanned < VOCAB_AI_CONFIG.maximumScannedPerRun &&
      completed < VOCAB_AI_CONFIG.maximumRowsPerRun) {
    const take = Math.min(100, scanEnd - cursor + 1, VOCAB_AI_CONFIG.maximumScannedPerRun - scanned);
    const values = sheet.getRange(cursor, 1, take, 6).getValues();
    const formulas = sheet.getRange(cursor, 4, take, 3).getFormulas();

    for (let offset = 0; offset < take; offset++) {
      const rowNumber = cursor + offset;
      scanned++;
      const valuesRow = values[offset];
      const lexical = valuesRow.slice(0, 3).map(v => String(v == null ? '' : v).trim());
      // Do not guess translations from a partial A/B/C paste.
      if (!lexical.every(Boolean)) continue;
      const needs = [3, 4, 5].filter((index, k) =>
        !String(valuesRow[index] == null ? '' : valuesRow[index]).trim() && !formulas[offset][k]);
      if (!needs.length) continue;

      try {
        const answer = vocabularyAiGenerate_({vi: lexical[0], ko: lexical[1], en: lexical[2]});
        const newValues = [answer.context, answer.grammar, answer.category];
        // Re-read immediately before writing, so edits made during the AI call
        // cannot be overwritten. Only write still-blank cells without formulas.
        const fresh = sheet.getRange(rowNumber, 1, 1, 6).getValues()[0];
        const freshFormulas = sheet.getRange(rowNumber, 4, 1, 3).getFormulas()[0];
        if (!lexical.every((v, i) => String(fresh[i] == null ? '' : fresh[i]).trim() === v)) {
          props.setProperty(urgent ? VOCAB_STATE.priorityStart : VOCAB_STATE.cursor,
            String(Math.min(rowNumber, Number(props.getProperty(urgent ? VOCAB_STATE.priorityStart : VOCAB_STATE.cursor)) || rowNumber)));
          continue;
        }
        for (let k = 0; k < 3; k++) {
          if (!String(fresh[k + 3] == null ? '' : fresh[k + 3]).trim() && !freshFormulas[k]) {
            sheet.getRange(rowNumber, k + 4).setValue(newValues[k]);
          }
        }
        completed++;
        props.setProperties({
          [VOCAB_STATE.lastSuccess]: new Date().toISOString() + ' · Row ' + rowNumber,
          [VOCAB_STATE.lastProvider]: answer.provider,
          [VOCAB_STATE.processed]: String(Number(props.getProperty(VOCAB_STATE.processed) || 0) + 1),
          [VOCAB_STATE.lastError]: ''
        });
      } catch (error) {
        const message = 'Row ' + rowNumber + ': ' + String(error && error.message || error).slice(0, 220);
        // Stay on failing row for a later retry; do not silently skip incomplete data.
        props.setProperties({
          [urgent ? VOCAB_STATE.priorityStart : VOCAB_STATE.cursor]: String(rowNumber),
          [VOCAB_STATE.dirty]: '1',
          [VOCAB_STATE.nextAttempt]: String(Date.now() + 10 * 60 * 1000),
          [VOCAB_STATE.lastError]: new Date().toISOString() + ' · ' + message,
          [VOCAB_STATE.errors]: String(Number(props.getProperty(VOCAB_STATE.errors) || 0) + 1)
        });
        console.error(message);
        return;
      }

      if (completed >= VOCAB_AI_CONFIG.maximumRowsPerRun) {
        cursor = rowNumber + 1;
        props.setProperties({
          [urgent ? VOCAB_STATE.priorityStart : VOCAB_STATE.cursor]: String(cursor),
          [VOCAB_STATE.dirty]: '1'
        });
        return;
      }
    }
    cursor += take;
  }

  // On reaching the end, reset the cursor. A future timer tick can rescan
  // to pick up edits, without API calls for already-complete rows.
  if (urgent) {
    // Other edits may have arrived during the API call. Never clear their queue.
    const latestStart = Number(props.getProperty(VOCAB_STATE.priorityStart)) || priorityStart;
    const latestEnd = Number(props.getProperty(VOCAB_STATE.priorityEnd)) || priorityEnd;
    const next = cursor > scanEnd ? (latestStart < priorityStart ? latestStart : scanEnd + 1) : cursor;
    if (next > latestEnd) props.setProperties({
      [VOCAB_STATE.priorityStart]: '0', [VOCAB_STATE.priorityEnd]: '0'
    });
    else props.setProperty(VOCAB_STATE.priorityStart, String(next));
    props.setProperty(VOCAB_STATE.nextAttempt, '0');
    return;
  }
  const wrapped = cursor > lastRow;
  props.setProperties({
    [VOCAB_STATE.cursor]: String(wrapped ? 2 : cursor),
    [VOCAB_STATE.dirty]: wrapped ? '0' : '1',
    [VOCAB_STATE.lastSweep]: wrapped ? String(Date.now()) : String(Number(props.getProperty(VOCAB_STATE.lastSweep)) || 0),
    [VOCAB_STATE.nextAttempt]: '0'
  });
}

function vocabularyAiGenerate_(words) {
  const props = PropertiesService.getScriptProperties();
  const geminiKey = props.getProperty('GEMINI_API_KEY');
  const groqKey = props.getProperty('GROQ_API_KEY');
  const modelOverrides = props.getProperty('GEMINI_MODELS');
  const geminiModels = modelOverrides
    ? modelOverrides.split(',').map(x => x.trim()).filter(Boolean).slice(0, 5)
    : VOCAB_AI_CONFIG.defaultGeminiModels;
  const groqModel = props.getProperty('GROQ_MODEL') || VOCAB_AI_CONFIG.defaultGroqModel;
  const prompt = [
    'You are an expert lexicographer and tutor of Vietnamese, Korean and English.',
    'The provided three translations are USER-AUTHORED; do not rewrite them.',
    'Return ONLY one valid JSON object with exactly three string properties:',
    '"context", "grammar", "category".',
    'context: in Vietnamese, explain the usage and natural contexts/expressions for this meaning (2–4 sentences).',
    'grammar: explain Vietnamese, Korean and English grammatical patterns and provide a clear, natural example',
    'sentence for each language, labeled VI:, KR:, EN:. Do not use literal translation if unnatural.',
    'category: short clear taxonomy in English, e.g. Technology / Software & AI, Business / HR,',
    'Beauty / Skincare, General / Everyday Language. Choose a meaningful domain and sub-domain.',
    'Do not hallucinate facts. If supplied translation meanings conflict, flag this in context rather than silently changing A–C.',
    'Input row as JSON:',
    JSON.stringify(words)
  ].join('\n');
  const errors = [];

  if (geminiKey) {
    for (const model of geminiModels) {
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
        const body = {
          contents: [{role: 'user', parts: [{text: prompt}]}],
          generationConfig: {responseMimeType: 'application/json', temperature: 0.25, maxOutputTokens: 1600}
        };
        const result = vocabularyAiPost_(url, { 'x-goog-api-key': geminiKey }, body);
        const text = (result.candidates || []).flatMap(c => (c.content && c.content.parts) || [])
          .map(part => part.text || '').join('').trim();
        return Object.assign(vocabularyAiParse_(text), {provider: 'Gemini / ' + model});
      } catch (error) { errors.push('Gemini ' + model + ': ' + String(error.message || error).slice(0, 100)); }
    }
  } else errors.push('GEMINI_API_KEY not configured');

  if (groqKey) {
    try {
      const body = {
        model: groqModel,
        messages: [
          {role: 'system', content: 'Respond with a valid JSON object containing context, grammar and category only.'},
          {role: 'user', content: prompt}
        ],
        temperature: 0.25,
        max_completion_tokens: 1600,
        response_format: {type: 'json_object'}
      };
      const result = vocabularyAiPost_('https://api.groq.com/openai/v1/chat/completions',
        {Authorization: 'Bearer ' + groqKey}, body);
      return Object.assign(
        vocabularyAiParse_(result.choices && result.choices[0] && result.choices[0].message &&
          result.choices[0].message.content),
        {provider: 'Groq / ' + groqModel}
      );
    } catch (error) { errors.push('Groq: ' + String(error.message || error).slice(0, 120)); }
  } else errors.push('GROQ_API_KEY not configured');
  throw new Error('AI providers failed: ' + errors.join('; '));
}

function vocabularyAiPost_(url, headers, payload) {
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status > 299) {
    // Do not log the URL or request headers: API keys must remain secret.
    throw new Error('HTTP ' + status + ': ' + body.slice(0, 160));
  }
  return JSON.parse(body);
}

function vocabularyAiParse_(text) {
  const raw = String(text || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  let output;
  try { output = JSON.parse(raw); }
  catch (e) { throw new Error('AI did not return valid JSON'); }
  const fields = ['context', 'grammar', 'category'];
  const cleaned = {};
  fields.forEach(field => {
    if (typeof output[field] !== 'string' || !output[field].trim()) throw new Error('Missing AI field ' + field);
    cleaned[field] = output[field].trim();
    if (cleaned[field].length > (field === 'grammar' ? 7000 : 2500))
      throw new Error('AI response field too long: ' + field);
    if (/^[=+@]/.test(cleaned[field])) cleaned[field] = "'" + cleaned[field];
  });
  // Avoid accepting short placeholder answers masquerading as full grammar examples.
  if (!['VI:', 'KR:', 'EN:'].every(marker => cleaned.grammar.includes(marker)))
    throw new Error('Grammar does not contain VI:, KR:, EN: examples');
  return cleaned;
}

function showVocabularyAiStatus() {
  const p = PropertiesService.getScriptProperties();
  const keys = Object.values(VOCAB_STATE);
  const lines = keys.map(k => k.replace('VOCAB_AI_', '') + ': ' + (p.getProperty(k) || '—'));
  lines.push('GEMINI_API_KEY: ' + (p.getProperty('GEMINI_API_KEY') ? 'Configured' : 'Missing'));
  lines.push('GROQ_API_KEY: ' + (p.getProperty('GROQ_API_KEY') ? 'Configured' : 'Missing'));
  SpreadsheetApp.getUi().alert('Vocabulary AI status', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
