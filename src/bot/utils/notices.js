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
      return String(reason || 'Intro request failed.');
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
      return String(reason || 'Intro decision failed.');
  }
}
