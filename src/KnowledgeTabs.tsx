export default function KnowledgeTabs({ page }: { page: 'wiki' | 'bounty' }) {
  return <nav className="knowledge-tabs" aria-label="百科分类"><a href="#wiki" aria-current={page === 'wiki' ? 'page' : undefined}>答题查询</a><a href="#bounty" aria-current={page === 'bounty' ? 'page' : undefined}>悬赏封印</a></nav>;
}
