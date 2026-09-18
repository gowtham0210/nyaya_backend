function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function phonesMatch(submittedPhone, firebasePhoneNumber) {
  const submittedDigits = normalizePhoneDigits(submittedPhone);
  const firebaseDigits = normalizePhoneDigits(firebasePhoneNumber);

  if (submittedDigits.length < 10 || firebaseDigits.length < 10) {
    return false;
  }

  return (
    submittedDigits.endsWith(firebaseDigits.slice(-10)) &&
    firebaseDigits.endsWith(submittedDigits.slice(-10))
  );
}

module.exports = {
  normalizePhoneDigits,
  phonesMatch,
};
