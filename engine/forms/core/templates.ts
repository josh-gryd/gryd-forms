// The four built-in starting points in Forms › Templates. Each call builds a
// fresh document with its own ids, so two forms made from one template share
// nothing. Saved templates (a form someone kept as a template) live in the
// database; these are code, so they can never be edited away.

import { emptyForm, newBlock, newPage, newEnding } from './factory'
import { makeOptions } from './components/choices'
import { shortId } from './ids'
import type { FormDefinition } from './schema'

export interface BuiltInTemplate {
  id: string
  name: string
  description: string
  category: 'Contact' | 'Intake' | 'Feedback' | 'Registration'
  build: () => FormDefinition
}

function contact(): FormDefinition {
  const def = emptyForm('Contact us')
  def.settings.description = 'Send us a message and we’ll get back to you.'
  def.pages[0].name = 'Your message'
  def.pages[0].buttonLabel = 'Send message'
  def.pages[0].blocks = [
    newBlock('heading', { label: 'Get in touch' }),
    newBlock('paragraph', { label: 'Tell us what you need and we’ll reply within one working day.' }),
    newBlock('short', { label: 'Name', required: true, width: 'half', settings: { autoComplete: 'name' } }),
    newBlock('email', { label: 'Email', required: true, width: 'half' }),
    newBlock('phone', { label: 'Phone', description: 'Only if you’d like a call back.' }),
    newBlock('dropdown', { label: 'What is this about?', required: true, options: makeOptions(['A general question', 'Sales', 'Support', 'Partnerships']) }),
    newBlock('long', { label: 'Message', required: true }),
  ]
  def.endings = [newEnding(1, { title: 'Thanks — your message is in.', body: 'We’ll reply to the email you gave within one working day.' })]
  return def
}

function intake(): FormDefinition {
  const def = emptyForm('Client intake')
  def.settings.description = 'A few questions before we start working together.'
  def.settings.progress = 'bar'
  const p1 = newPage(1, { name: 'About you', blocks: [
    newBlock('heading', { label: 'Welcome aboard' }),
    newBlock('paragraph', { label: 'This takes about five minutes. Your answers help us prepare for the kickoff.' }),
    newBlock('short', { label: 'Full name', required: true, width: 'half', settings: { autoComplete: 'name' } }),
    newBlock('email', { label: 'Email', required: true, width: 'half' }),
    newBlock('phone', { label: 'Phone', width: 'half' }),
    newBlock('short', { label: 'Company', required: true, width: 'half', settings: { autoComplete: 'organization' } }),
    newBlock('short', { label: 'Your role' }),
  ] })
  const p2 = newPage(2, { name: 'The work', blocks: [
    newBlock('checks', { label: 'What do you need help with?', required: true, options: makeOptions(['Strategy', 'Design', 'Engineering', 'Operations', 'Something else']) }),
    newBlock('long', { label: 'Describe the project', required: true, description: 'What does success look like?' }),
    newBlock('dropdown', { label: 'Budget', width: 'half', options: makeOptions(['Under $10k', '$10k–$50k', '$50k–$150k', 'Over $150k', 'Not sure yet']) }),
    newBlock('date', { label: 'Ideal start date', width: 'half' }),
    newBlock('upload', { label: 'Anything we should read first', description: 'A brief, a deck or a screenshot. Optional.' }),
  ] })
  const p3 = newPage(3, { name: 'Wrap up', buttonLabel: 'Submit', blocks: [
    newBlock('dropdown', { label: 'How did you hear about us?', options: makeOptions(['A referral', 'Search', 'Social media', 'An event', 'Other']) }),
    newBlock('long', { label: 'Anything else we should know?' }),
  ] })
  def.pages = [p1, p2, p3]
  def.endings = [newEnding(1, { title: 'Thanks — we’re on it.', body: 'We’ll review your answers and send a kickoff invite within two working days.' })]
  return def
}

function feedback(): FormDefinition {
  const def = emptyForm('Feedback')
  def.settings.description = 'Tell us how we did.'
  const followUp = newBlock('yesno', { label: 'May we follow up with you?' })
  const email = newBlock('email', { label: 'Email', required: true })
  def.pages[0].name = 'Feedback'
  def.pages[0].blocks = [
    newBlock('heading', { label: 'How did we do?' }),
    newBlock('rating', { label: 'Overall, how satisfied are you?', required: true }),
    newBlock('scale', { label: 'How likely are you to recommend us to a friend?', settings: { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' } }),
    newBlock('long', { label: 'What did we do well?' }),
    newBlock('long', { label: 'What could we do better?' }),
    followUp,
    email,
  ]
  def.rules = [{ id: shortId('r'), when: { id: shortId('c'), join: 'and', items: [{ id: shortId('c'), field: followUp.id, op: 'is_true', value: null }] }, then: { type: 'show_field', target: email.id } }]
  def.endings = [newEnding(1, { title: 'Thank you for the feedback.', body: 'Every answer is read by the team.' })]
  return def
}

function registration(): FormDefinition {
  const def = emptyForm('Event registration')
  def.settings.description = 'Save your seat.'
  def.pages[0].name = 'Registration'
  def.pages[0].buttonLabel = 'Register'
  def.pages[0].blocks = [
    newBlock('heading', { label: 'Save your seat' }),
    newBlock('paragraph', { label: 'Register below and we’ll email your ticket and the agenda.' }),
    newBlock('short', { label: 'First name', required: true, width: 'half', settings: { autoComplete: 'given-name' } }),
    newBlock('short', { label: 'Last name', required: true, width: 'half', settings: { autoComplete: 'family-name' } }),
    newBlock('email', { label: 'Email', required: true, width: 'half' }),
    newBlock('short', { label: 'Company', width: 'half', settings: { autoComplete: 'organization' } }),
    newBlock('checks', { label: 'Which sessions will you attend?', required: true, options: makeOptions(['Morning keynote', 'Afternoon workshops', 'Evening reception']) }),
    newBlock('dropdown', { label: 'Dietary requirements', options: makeOptions(['None', 'Vegetarian', 'Vegan', 'Gluten free', 'Other']) }),
    newBlock('long', { label: 'Accessibility needs', description: 'Tell us anything that would make the day easier.' }),
  ]
  def.endings = [newEnding(1, { title: 'You’re registered.', body: 'Your ticket and the agenda are on their way to your inbox.', confetti: true })]
  return def
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  { id: 'builtin-contact', name: 'Contact form', description: 'Name, email, topic and a message.', category: 'Contact', build: contact },
  { id: 'builtin-intake', name: 'Client intake', description: 'Three pages: who they are, the work, and how they found you.', category: 'Intake', build: intake },
  { id: 'builtin-feedback', name: 'Feedback', description: 'A rating, a 0–10 score and two open questions, with an optional follow-up.', category: 'Feedback', build: feedback },
  { id: 'builtin-registration', name: 'Event registration', description: 'Attendee details, sessions and dietary needs.', category: 'Registration', build: registration },
]

export function builtInTemplate(id: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id)
}
