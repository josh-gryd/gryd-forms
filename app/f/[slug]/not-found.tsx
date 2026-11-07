import '../../forms/forms.css'
import { DEFAULT_THEME } from '@/lib/forms-core/index'
import StatePanel, { themedButton } from './StatePanel'
import BackButton from './BackButton'

// A slug that never published, or a deleted form: a 404 in the form surface's own
// look, never the portal's. The visitor can't fix a wrong link themselves, so the
// page offers a way on instead of a dead end (QA 09-25, round 3). Nothing here
// knows the form, so nothing here knows its language.
export default function FormNotFound() {
  const theme = DEFAULT_THEME
  return (
    <StatePanel theme={theme} language="en" embed={false} tag="Not available" title="This form isn’t available." body="The link may be wrong, or the form was never published. Check with whoever sent it to you." testId="form-unavailable">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <BackButton label="Go back" style={themedButton(theme)} />
      </div>
    </StatePanel>
  )
}
