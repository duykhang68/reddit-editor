import TurndownService from 'turndown';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {consumeSeriesFrontmatter, seriesFrontmatter} from './series.js';
import {scheduleFrontmatter, parseScheduleFrontmatter} from './schedule.js';
const converter = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced'});
// Rich article blocks and tables remain valid inline HTML inside Markdown.
converter.keep(['table','aside','section','figure','details','div','u']);
export function serializeArticle({title, labels, html, series, schedule}) {
  const seriesYaml=seriesFrontmatter(series);
  const scheduleYaml=scheduleFrontmatter(schedule);
  const frontmatter=seriesYaml
    ? (scheduleYaml ? seriesYaml.replace(/---\n\n$/,scheduleYaml+'---\n\n') : seriesYaml)
    : (scheduleYaml?'---\n'+scheduleYaml+'---\n\n':'');
  return frontmatter + '<!-- duy-editor:' + JSON.stringify({title, labels}).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') + ' -->\n\n# ' + title.replace(/\r?\n/g, ' ') + '\n\n' + converter.turndown(html) + '\n';
}
export function parseArticle(content, name = 'Bài viết') {
  const schedule=parseScheduleFrontmatter(content);
  const frontmatter=consumeSeriesFrontmatter(content);
  content=frontmatter.content;
  let title = name.replace(/\.md$/i, ''), labels = '';
  const match = content.match(/^<!-- duy-editor:(.*?) -->\r?\n/);
  if (match) {
    const data = JSON.parse(match[1]);
    title = typeof data.title === 'string' ? data.title : title;
    labels = typeof data.labels === 'string' ? data.labels : '';
    content = content.slice(match[0].length).replace(/^\s*# [^\r\n]*(?:\r?\n|$)/, '');
  } else {
    const heading = content.match(/^# (.+)(?:\r?\n|$)/);
    if (heading) { title = heading[1]; content = content.slice(heading[0].length); }
  }
  return {title, labels, html: DOMPurify.sanitize(marked.parse(content), {ADD_ATTR: ['class', 'data-kind'], FORBID_TAGS: ['style','iframe','object','embed']}), series:frontmatter.series,schedule};
}
