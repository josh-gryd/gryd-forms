// Demo mode (FORMS_DEMO=1) as the web app sees it. The engine enforces the rules
// (engine/demo.ts); this side draws the banners and limits each visitor.

export const isDemo = (): boolean => process.env.FORMS_DEMO === '1'

export const DEMO_REPO_URL = process.env.FORMS_DEMO_REPO_URL || 'https://github.com/josh-gryd/gryd-forms'
