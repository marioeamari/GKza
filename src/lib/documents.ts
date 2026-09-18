export const onlyDigits = (value: string) => value.replace(/\D/g, '')

export function formatCPF(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCNPJ(value: string) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 10)
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function isValidCPF(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const calculate = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index)
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  }
  return calculate(9) === Number(cpf[9]) && calculate(10) === Number(cpf[10])
}

export function isValidCNPJ(value: string) {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const calculate = (base: string) => {
    let weight = base.length - 7
    let sum = 0
    for (const digit of base) {
      sum += Number(digit) * weight--
      if (weight < 2) weight = 9
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = calculate(cnpj.slice(0, 12))
  const second = calculate(cnpj.slice(0, 12) + first)
  return `${first}${second}` === cnpj.slice(12)
}
