// Формат даты: DD.MM.YYYY
export const formatDateInput = (value) => {
  const numbers = value.replace(/\D/g, "");
  let result = "";

  for (let index = 0; index < numbers.length && index < 8; index += 1) {
    if (index === 2 || index === 4) {
      result += ".";
    }
    result += numbers[index];
  }

  return result;
};

// Формат телефона: +7 (123) 456-78-90
export const formatPhoneNumber = (value) => {
  if (!value) return value;

  const phoneNumber = value.replace(/[^\d]/g, "");
  const phoneNumberLength = phoneNumber.length;

  let formattedNumber = phoneNumber;
  if (phoneNumber.startsWith("8")) {
    formattedNumber = `7${phoneNumber.slice(1)}`;
  }

  if (phoneNumberLength < 2) {
    return formattedNumber;
  }
  if (phoneNumberLength < 5) {
    return `+7 (${formattedNumber.slice(1)}`;
  }
  if (phoneNumberLength < 8) {
    return `+7 (${formattedNumber.slice(1, 4)}) ${formattedNumber.slice(4)}`;
  }
  if (phoneNumberLength < 10) {
    return `+7 (${formattedNumber.slice(1, 4)}) ${formattedNumber.slice(4, 7)}-${formattedNumber.slice(7)}`;
  }
  return `+7 (${formattedNumber.slice(1, 4)}) ${formattedNumber.slice(4, 7)}-${formattedNumber.slice(7, 9)}-${formattedNumber.slice(9, 11)}`;
};

// Формат СНИЛС: 123-456-789 00
export const formatSnils = (value) => {
  if (!value) return value;

  const snils = value.replace(/[^\d]/g, "");
  const snilsLength = snils.length;

  if (snilsLength < 4) {
    return snils;
  }
  if (snilsLength < 7) {
    return `${snils.slice(0, 3)}-${snils.slice(3)}`;
  }
  if (snilsLength < 10) {
    return `${snils.slice(0, 3)}-${snils.slice(3, 6)}-${snils.slice(6)}`;
  }
  return `${snils.slice(0, 3)}-${snils.slice(3, 6)}-${snils.slice(6, 9)} ${snils.slice(9, 11)}`;
};

// Формат КИГ: АА 1234567
export const formatKig = (value) => {
  if (!value) return value;

  let kig = value.toUpperCase();
  kig = kig.replace(/[^A-Z0-9]/g, "");

  const letters = kig.replace(/[^A-Z]/g, "");
  const numbers = kig.replace(/[^0-9]/g, "");

  const limitedLetters = letters.slice(0, 2);
  const limitedNumbers = numbers.slice(0, 7);

  if (limitedLetters.length === 0) {
    return "";
  }
  if (limitedNumbers.length === 0) {
    return limitedLetters;
  }
  return `${limitedLetters} ${limitedNumbers}`;
};

// Формат ИНН: XXXX-XXXXX-X или XXXX-XXXXXX-XX
export const formatInn = (value) => {
  if (!value) return value;

  const inn = value.replace(/[^\d]/g, "");
  const innLength = inn.length;

  if (innLength <= 4) {
    return inn;
  }
  if (innLength <= 9) {
    return `${inn.slice(0, 4)}-${inn.slice(4)}`;
  }
  if (innLength === 10) {
    return `${inn.slice(0, 4)}-${inn.slice(4, 9)}-${inn.slice(9)}`;
  }
  if (innLength <= 10) {
    return `${inn.slice(0, 4)}-${inn.slice(4, 10)}`;
  }
  return `${inn.slice(0, 4)}-${inn.slice(4, 10)}-${inn.slice(10, 12)}`;
};
