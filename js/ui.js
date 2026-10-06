// 轻量弹层: toast / modal / confirm / sheet
function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}
export { h };

// 统一栈导航栏: 左侧返回(chevron + 上级标题), 居中标题, 右侧操作位
export function navBar({ title = '', onBack = null, backLabel = '', extra = null } = {}) {
  return h('div', { class: 'topbar' }, [
    onBack
      ? h('button', { class: 'nav-back', 'aria-label': '返回', onclick: onBack }, [
          h('span', { class: 'nav-chevron' }),
          backLabel ? h('span', { class: 'nav-back-label' }, backLabel) : null
        ])
      : h('span', { class: 'nav-side' }),
    h('div', { class: 'title' }, title),
    extra ? h('span', { class: 'nav-side nav-right' }, extra) : h('span', { class: 'nav-side' })
  ]);
}

export function toast(text, ms = 1800) {
  const t = h('div', { class: 'toast' }, text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

export function modal({ title = '', body = '', html = '', buttons = [], seal }) {
  closeModal();
  const mask = h('div', { class: 'mask', id: 'ui-modal-mask' });
  const m = h('div', { class: 'modal' });
  if (seal) m.appendChild(h('div', { class: 'result-seal ' + seal.cls }, seal.text));
  if (title) m.appendChild(h('h2', {}, title));
  if (html) { const d = h('div', { class: 'modal-sub', html }); m.appendChild(d); }
  if (body) m.appendChild(h('div', { class: 'modal-sub' }, body));
  for (const b of buttons) {
    m.appendChild(h('button', {
      class: 'btn ' + (b.cls || 'btn-block'), style: b.style || '',
      onclick: () => { if (b.keep) b.onClick && b.onClick(m); else { closeModal(); b.onClick && b.onClick(m); } }
    }, b.text));
  }
  mask.appendChild(m);
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask && !buttons.some(b => b.required)) closeModal(); });
  document.body.appendChild(mask);
  return m;
}
export function closeModal() { document.getElementById('ui-modal-mask')?.remove(); }

export function confirmBox({ title, body = '', okText = '同意', cancelText = '拒绝', onOk, onCancel, okCls = 'btn-primary' }) {
  modal({
    title, body,
    buttons: [
      { text: okText, cls: okCls, onClick: onOk },
      { text: cancelText, cls: 'btn-ghost', onClick: onCancel }
    ]
  });
}

export function sheet({ title, bodyEl, onClose }) {
  closeSheet();
  const mask = h('div', { class: 'sheet-mask', id: 'ui-sheet-mask' });
  const sh = h('div', { class: 'sheet' });
  sh.appendChild(h('div', { class: 'sheet-head' }, [
    h('h3', {}, title),
    h('button', { class: 'icon-btn', onclick: () => { closeSheet(); onClose && onClose(); } }, '关闭')
  ]));
  const body = h('div', { class: 'sheet-body' });
  if (bodyEl) body.appendChild(bodyEl);
  sh.appendChild(body);
  mask.appendChild(sh);
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask) { closeSheet(); onClose && onClose(); } });
  document.body.appendChild(mask);
  return { mask, body, close: closeSheet };
}
export function closeSheet() { document.getElementById('ui-sheet-mask')?.remove(); }
