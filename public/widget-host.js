let scriptUrl;
addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'pingan-widget') return;
  const { html, css, js, data } = event.data;
  document.getElementById('content').innerHTML = String(html);
  document.querySelectorAll('style[data-widget],script[data-widget],[data-widget-error]').forEach(node => node.remove());
  const style = document.createElement('style'); style.dataset.widget = ''; style.textContent = `body{margin:16px;color:#28354a;font:14px/1.6 system-ui}*{box-sizing:border-box}${css}`; document.head.append(style);
  if (scriptUrl) URL.revokeObjectURL(scriptUrl);
  if (js) { scriptUrl = URL.createObjectURL(new Blob([`(()=>{const data=Object.freeze(${JSON.stringify(data)});\n${js}\n})();`], { type: 'text/javascript' })); const script = document.createElement('script'); script.dataset.widget = ''; script.src = scriptUrl; document.body.append(script); }
});
addEventListener('error', event => { const error = document.createElement('pre'); error.dataset.widgetError = ''; error.textContent = `组件错误：${event.message}`; error.style.color = '#a33832'; document.body.append(error); });
