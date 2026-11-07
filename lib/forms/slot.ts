// The id of the element AppSidebar renders in place of its page list while the
// form builder is open. Builder.tsx portals its sidebar panels (fields, page
// and field settings, theme) into it, so the shell column stays mounted and
// the builder never draws a column of its own.
export const FORMS_SIDEBAR_SLOT = 'forms-sidebar-slot'
export const FORMS_SIDEBAR_W = 288
/** The Forms app's own pages under /forms/; any other segment is a form id. */
export const FORMS_APP_PAGES = ['responses', 'templates', 'archived', 'settings']
export const isFormBuilderPath = (pathname: string): boolean => {
  const m = /^\/forms\/([^/]+)/.exec(pathname)
  return !!m && !FORMS_APP_PAGES.includes(m[1])
}
