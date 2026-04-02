import { ValidationError } from "class-validator";

const fieldLabels: Record<string, string> = {
  action: "acao",
  active: "status ativo",
  address: "endereco",
  amount: "valor",
  bannerUrl: "URL do banner",
  brand: "marca",
  cashSessionId: "sessao de caixa",
  cashTerminalId: "terminal de caixa",
  categoryId: "categoria",
  city: "cidade",
  closingAmount: "valor de fechamento",
  cnpj: "CNPJ",
  contactName: "contato",
  costPrice: "preco de custo",
  cpfCnpj: "CPF/CNPJ",
  customerId: "cliente",
  defaultSerialized: "serializacao padrao",
  description: "descricao",
  discountAmount: "desconto",
  displayName: "nome exibido",
  dueDate: "vencimento",
  email: "e-mail",
  endDate: "data final",
  entity: "entidade",
  hasSerialControl: "controle serial",
  heroBannerEnabled: "banner principal",
  installments: "parcelas",
  isService: "servico",
  limit: "limite",
  logoUrl: "URL da logo",
  model: "modelo",
  name: "nome",
  needsPriceReview: "revisao de preco",
  newPassword: "nova senha",
  notes: "observacoes",
  openingAmount: "valor de abertura",
  password: "senha",
  paymentMethod: "forma de pagamento",
  phone: "telefone",
  phone2: "telefone 2",
  prefix: "prefixo",
  primaryColor: "cor primaria",
  productId: "produto",
  quantity: "quantidade",
  referenceCode: "codigo de referencia",
  roleId: "papel",
  salePrice: "preco de venda",
  search: "busca",
  secondaryColor: "cor secundaria",
  sequenceName: "sequence_name",
  startDate: "data inicial",
  state: "UF",
  stateRegistration: "inscricao estadual",
  status: "status",
  stockMin: "estoque minimo",
  storeId: "loja",
  supplierCode: "codigo do fornecedor",
  supplierId: "fornecedor",
  take: "limite",
  term: "busca",
  tradeName: "nome fantasia",
  unitPrice: "preco unitario",
  userId: "usuario",
  zipCode: "CEP"
};

function toSentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizeProperty(property: string) {
  const mapped = fieldLabels[property];
  if (mapped) {
    return toSentenceCase(mapped);
  }

  const normalized = property
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();

  return toSentenceCase(normalized);
}

function translateConstraint(message: string, property: string) {
  const field = humanizeProperty(property);

  if (!/\bmust\b|\bshould\b|\binvalid\b/i.test(message)) {
    return message;
  }

  if (/must be a string/i.test(message)) {
    return `${field} deve ser um texto.`;
  }

  const maxLengthMatch = message.match(
    /must be shorter than or equal to (\d+) characters/i
  );
  if (maxLengthMatch) {
    return `${field} deve ter no maximo ${maxLengthMatch[1]} caracteres.`;
  }

  const minLengthMatch = message.match(
    /must be longer than or equal to (\d+) characters/i
  );
  if (minLengthMatch) {
    return `${field} deve ter no minimo ${minLengthMatch[1]} caracteres.`;
  }

  if (/should not be empty/i.test(message)) {
    return `${field} e obrigatorio.`;
  }

  if (/must be a UUID/i.test(message)) {
    return `${field} deve ser um identificador valido.`;
  }

  if (/must be an integer number/i.test(message)) {
    return `${field} deve ser um numero inteiro.`;
  }

  const minValueMatch = message.match(/must not be less than (\d+)/i);
  if (minValueMatch) {
    return `${field} deve ser maior ou igual a ${minValueMatch[1]}.`;
  }

  if (/must be a boolean value/i.test(message)) {
    return `${field} deve ser verdadeiro ou falso.`;
  }

  if (/must be a valid ISO 8601 date string/i.test(message)) {
    return `${field} deve ser uma data valida.`;
  }

  const enumMatch = message.match(/must be one of the following values: (.+)$/i);
  if (enumMatch) {
    return `${field} deve ser um dos seguintes valores: ${enumMatch[1]}.`;
  }

  if (/must be an array/i.test(message)) {
    return `${field} deve ser uma lista valida.`;
  }

  if (/must be a valid enum value/i.test(message)) {
    return `${field} deve ter um valor valido.`;
  }

  return message
    .replace(new RegExp(`^${property}\\s+`, "i"), `${field} `)
    .replace(/\bmust be\b/gi, "deve ser")
    .replace(/\bshould not be\b/gi, "nao deve ser")
    .replace(/\binvalid\b/gi, "invalido");
}

function flattenErrors(errors: ValidationError[], parentPath?: string): string[] {
  return errors.flatMap((error) => {
    const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    const currentMessages = error.constraints
      ? Object.values(error.constraints).map((message) =>
          translateConstraint(message, error.property)
        )
      : [];

    const nestedMessages = error.children?.length
      ? flattenErrors(error.children, propertyPath)
      : [];

    return [...currentMessages, ...nestedMessages];
  });
}

export function formatValidationErrors(errors: ValidationError[]) {
  const messages = flattenErrors(errors).filter(Boolean);
  return messages.length ? messages : ["Os dados enviados sao invalidos."];
}
