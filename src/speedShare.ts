export interface SpeedShare { name: string; version: string; filters: string; counts: { label: string; count: number }[]; unknown: number }

// Draw the same summary used by the cards; no screenshot library or remote data.
export async function speedSummaryPng(summary: SpeedShare): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持图片生成，请使用 CSV 导出');
  ctx.fillStyle = '#f5f6f9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value: string, y: number, size = 26, color = '#202736') => {
    ctx.font = `${size}px "Microsoft YaHei UI", sans-serif`; ctx.fillStyle = color;
    ctx.fillText(value, 64, y, 1072);
  };
  text('平安手札 · 速度资产', 90, 42);
  text(summary.name, 150, 32);
  text(summary.version, 198, 24);
  text(summary.filters, 246, 22);
  summary.counts.forEach((item, index) => {
    const y = 304 + index * 72;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(56, y - 36, 1088, 64);
    text(item.label, y + 5, 28);
    ctx.textAlign = 'right'; ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#355bb5'; ctx.fillText(String(item.count), 1110, y + 5); ctx.textAlign = 'left';
  });
  text(`强化次数未读取：${summary.unknown} 枚（不计入统计）`, 722, 24);
  text('口径：六星 +15，速度含初始共获得 6 次；真17按未取整数值判断。', 770, 23);
  text('头：2号位速度；脚：4号位抵抗；尾：4号位命中。均须满足满速口径。', 810, 23);
  text(`本地参考统计 · ${new Date().toLocaleString('zh-CN')}`, 854, 20);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
