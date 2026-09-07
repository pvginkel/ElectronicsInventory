export default {
  srcExclude: ['features/**', 'epics/**'],
  markdown: {
    // Disables raw HTML in markdown entirely: these docs quote angle-bracket
    // placeholders and JSX freely, which VitePress would otherwise try to render.
    html: false
  }
}
