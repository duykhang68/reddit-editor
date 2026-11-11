// Deterministic, opt-in draft analysis. No external AI service or private draft transfer.
const decode = s => String(s).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const clean = s => decode(String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,125);
const escapeXML = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const stripNumbers = s => s.replace(/^\s*(?:\d+[.)]|[-•])\s*/,'');

export function findDiagramCandidates(html) {
  if (typeof html !== 'string') return [];
  const segments = html.split(/<h[1-4][^>]*>/i).slice(1);
  const candidates = [];
  for (const [i, segment] of segments.entries()) {
    const match = segment.match(/^([\s\S]*?)<\/h[1-4]>/i);
    if (!match) continue;
    const heading = clean(match[1]);
    const body = segment.slice(match[0].length).split(/<h[1-4][^>]*>/i)[0];
    const list = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>clean(m[1])).filter(Boolean);
    const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>clean(m[1])).filter(Boolean);
    let steps = list.length>=3 ? list : paragraphs.filter(p=>/^(?:bước\s*\d+|step\s*\d+|\d+[.)])/i.test(p)).map(stripNumbers);
    if (steps.length < 3) continue;
    steps = steps.slice(0,8);
    if (steps.some(step=>step.length>125)) continue;
    const id = 'auto-diagram-' + i;
    candidates.push({id,heading:heading||'Quy trình',steps,kind: /so sánh|ưu nhược|comparison/i.test(heading)?'comparison':'flow',confidence:list.length>=3?'high':'medium'});
    if (candidates.length>=6) break;
  }
  return candidates;
}

export function makeDrawioXML(candidate) {
  const title = escapeXML(candidate.heading||'Quy trình');
  const steps = candidate.steps.slice(0,8);
  const horizontal = steps.length<=4;
  const width = horizontal? Math.max(820, steps.length*240+80):850;
  const height = horizontal?390:Math.max(520,steps.length*118+130);
  const nodes = steps.map((step,i)=>{
    const x = horizontal? 40+i*240:130;
    const y = horizontal?140:95+i*118;
    const fill = i===0?'#e0f2fe':i===steps.length-1?'#dcfce7':'#f3f0ff';
    const stroke = i===0?'#0284c7':i===steps.length-1?'#16a34a':'#8b5cf6';
    return `<mxCell id="n${i}" value="${escapeXML(step)}" style="rounded=1;whiteSpace=wrap;html=0;align=center;verticalAlign=middle;fontFamily=Arial;fontSize=15;fontStyle=1;spacing=14;fillColor=${fill};strokeColor=${stroke};strokeWidth=2;shadow=0;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="188" height="76" as="geometry"/></mxCell>`;
  }).join('');
  const links = steps.slice(1).map((_,i)=>`<mxCell id="e${i}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=0;endArrow=block;endFill=1;strokeColor=#64748b;strokeWidth=2;" edge="1" parent="1" source="n${i}" target="n${i+1}"><mxGeometry relative="1" as="geometry"/></mxCell>`).join('');
  const heading = `<mxCell id="title" value="${title}" style="text;html=0;align=center;verticalAlign=middle;whiteSpace=wrap;fontFamily=Arial;fontSize=23;fontStyle=1;fontColor=#1e293b;" vertex="1" parent="1"><mxGeometry x="40" y="18" width="${width-80}" height="55" as="geometry"/></mxCell>`;
  return `<mxfile host="app.diagrams.net"><diagram name="Auto Visualize"><mxGraphModel dx="1100" dy="900" grid="1" gridSize="10" guides="1" connect="1" arrows="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${heading}${nodes}${links}</root></mxGraphModel></diagram></mxfile>`;
}
