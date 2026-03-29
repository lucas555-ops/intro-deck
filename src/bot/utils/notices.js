
export function formatDmRequestReason(reason) {
  switch (reason) {
    case 'connect_linkedin_before_dm_request':
      return 'Connect LinkedIn before starting DM requests.';
    case 'cannot_message_self':
      return 'You cannot open a DM request to your own profile.';
    case 'target_profile_missing':
      return 'The target profile is no longer available.';
    case 'target_profile_not_public':
      return 'This profile is not publicly listed right now.';
    case 'dm_thread_already_exists':
      return 'A DM request is already open for this profile.';
    case 'dm_thread_already_active':
      return 'An active DM thread already exists with this member.';
    case 'dm_thread_blocked':
      return 'This DM path is blocked right now.';
    case 'dm_request_throttled':
      return 'Please wait a moment before opening the same DM request again.';
    case 'dm_payment_already_confirmed':
      return 'This DM request was already paid.';
    case 'dm_thread_not_ready_for_payment':
      return 'Save your first message before paying for this DM request.';
    case 'dm_thread_not_active':
      return 'This conversation is not active yet.';
    case 'dm_thread_declined':
      return 'This DM request was declined.';
    default:
      return 'Could not open the DM request right now.';
  }
}

export function formatDmDecisionReason(reason) {
  switch (reason) {
    case 'dm_thread_missing':
      return 'This DM thread is no longer available.';
    case 'dm_thread_not_actionable_by_user':
      return 'Only the recipient can act on this DM request.';
    case 'dm_invalid_decision':
      return 'That DM decision is not supported.';
    case 'dm_thread_already_active':
      return 'This DM thread is already active.';
    case 'dm_thread_already_declined':
      return 'This DM request was already declined.';
    case 'dm_thread_blocked':
      return 'This DM path is blocked.';
    case 'dm_thread_not_ready_for_decision':
      return 'This DM request is not ready for review yet.';
    case 'dm_thread_reported':
      return 'This DM request was reported and blocked.';
    default:
      return 'Could not update the DM thread right now.';
  }
}

export function formatContactUnlockRequestReason(reason) {
  switch (reason) {
    case 'connect_linkedin_before_contact_unlock':
      return 'Connect LinkedIn before requesting direct contact.';
    case 'cannot_request_direct_contact_to_self':
      return 'You cannot request direct contact to your own profile.';
    case 'target_profile_missing':
      return 'The target profile is no longer available.';
    case 'target_profile_not_public':
      return 'This profile is not publicly listed right now.';
    case 'target_profile_not_paid_unlock_mode':
      return 'This profile does not accept paid direct contact requests right now.';
    case 'target_profile_no_hidden_telegram_username':
      return 'This profile has no hidden Telegram username configured right now.';
    case 'contact_unlock_request_already_exists':
      return 'A direct contact request is already active for this profile.';
    case 'contact_unlock_already_revealed':
      return 'Direct contact is already unlocked for this profile.';
    case 'contact_unlock_request_throttled':
      return 'Please wait a moment before sending the same direct contact request again.';
    case 'contact_unlock_payment_already_confirmed':
      return 'This direct contact request was already paid.';
    default:
      return 'Could not open the direct contact request right now.';
  }
}

export function formatContactUnlockDecisionReason(reason) {
  switch (reason) {
    case 'contact_unlock_request_missing':
      return 'This direct contact request is no longer available.';
    case 'contact_unlock_request_not_actionable_by_user':
      return 'Only the recipient can approve or decline this direct contact request.';
    case 'contact_unlock_invalid_decision':
      return 'That direct contact decision is not supported.';
    case 'contact_unlock_already_revealed':
      return 'This direct contact request was already approved and revealed.';
    case 'contact_unlock_already_declined':
      return 'This direct contact request was already declined.';
    case 'contact_unlock_request_not_ready_for_decision':
      return 'This direct contact request is not ready for approval yet.';
    case 'target_profile_not_paid_unlock_mode':
      return 'This profile no longer accepts paid direct contact requests.';
    case 'target_profile_no_hidden_telegram_username':
      return 'No hidden Telegram username is available to reveal right now.';
    default:
      return 'Could not update the direct contact request right now.';
  }
}

export function formatIntroRequestReason(reason) {
  switch (reason) {
    case 'connect_linkedin_before_intro_request':
      return 'Connect LinkedIn before sending intro requests.';
    case 'cannot_request_intro_to_self':
      return 'You cannot request an intro to your own profile.';
    case 'target_profile_missing':
      return 'The target profile is no longer available.';
    case 'target_profile_not_public':
      return 'This profile is not publicly listed right now.';
    case 'target_profile_not_intro_request_mode':
      return 'This profile does not accept intro requests right now.';
    case 'intro_request_already_exists':
      return 'An intro request already exists for this profile.';
    case 'intro_request_throttled':
      return 'Please wait a moment before sending the same intro request again.';
    default:
      return 'Could not send the intro request right now.';
  }
}

export function formatIntroDecisionReason(reason) {
  switch (reason) {
    case 'connect_linkedin_before_intro_decision':
      return 'Connect LinkedIn before acting on intro requests.';
    case 'intro_request_missing':
      return 'This intro request is no longer available.';
    case 'intro_request_not_actionable_by_user':
      return 'Only the recipient can accept or decline this intro request.';
    case 'intro_request_invalid_decision':
      return 'That intro decision is not supported.';
    case 'intro_request_already_accepted':
      return 'This intro request was already accepted.';
    case 'intro_request_already_declined':
      return 'This intro request was already declined.';
    case 'intro_request_already_cancelled':
      return 'This intro request was already cancelled.';
    case 'intro_decision_throttled':
      return 'Please wait a moment before repeating the same intro action.';
    case 'intro_request_decision_failed':
      return 'Could not save the intro decision right now.';
    default:
      return 'Could not update the intro request right now.';
  }
}

export function formatUserFacingError(input, fallback = 'Something went wrong. Please try again.') {
  const message = String(input || '').trim();
  if (!message) {
    return fallback;
  }

  const safeDirectMessages = [
    'cannot be empty',
    'is too long',
    'must be a valid URL',
    'must start with http:// or https://',
    'must point to linkedin.com',
    'must be a member profile URL',
    'must be 5-32 characters and use only letters, numbers, or underscores'
  ];

  if (safeDirectMessages.some((needle) => message.includes(needle))) {
    return message;
  }

  if (
    message.includes('Profile not found for edit session') ||
    message.includes('Profile not found for skill toggle') ||
    message.includes('Profile not found for clear skills')
  ) {
    return 'Complete LinkedIn connection first, then open your profile again.';
  }

  if (message.includes('DATABASE_URL is not configured')) {
    return 'This feature is unavailable right now.';
  }

  const internalSignals = [
    'violates',
    'constraint',
    'relation "',
    'SQLSTATE',
    'duplicate key',
    'syntax error',
    'Cannot find module',
    'Unsupported profile field key',
    'Unsupported field key',
    'column ',
    'insert into',
    'update ',
    'delete from'
  ];

  if (internalSignals.some((needle) => message.includes(needle))) {
    return fallback;
  }

  return message;
}
