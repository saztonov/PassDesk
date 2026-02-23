export const PASSWORD_MIN_LENGTH = 8;

export const getPasswordMinLengthMessage = (fieldName = "Пароль") =>
  `${fieldName} должен содержать минимум ${PASSWORD_MIN_LENGTH} символов`;
