import {Node, mergeAttributes} from '@tiptap/core';

// Matches the .hd-note styles already present in the user's Blogger XML theme.
export const Callout=Node.create({
  name:'hdNote',group:'block',content:'paragraph+',defining:true,
  addAttributes(){return {kind:{default:'tip',parseHTML:el=>el.getAttribute('data-kind')||(el.classList.contains('hd-note--warning')?'warning':el.classList.contains('hd-note--tip')?'tip':'info'),renderHTML:attrs=>({'data-kind':attrs.kind})}};},
  parseHTML(){return [{tag:'aside.hd-note'},{tag:'div.hd-note'}];},
  renderHTML({HTMLAttributes}){
    const kind=['tip','warning','info'].includes(HTMLAttributes['data-kind'])?HTMLAttributes['data-kind']:'info';
    return ['aside',mergeAttributes(HTMLAttributes,{class:`hd-note hd-note--${kind}`}),0];
  }
});
