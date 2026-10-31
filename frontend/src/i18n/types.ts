import type enUS from './locales/en-US';

export type Locale = 'en-US' | 'pt-BR';

type BaseTranslationSchema = typeof enUS;

type DeepString<T> = T extends object
  ? { [K in keyof T]: DeepString<T[K]> }
  : string;

type RequiredTranslationSchema = {
  [K in Exclude<keyof BaseTranslationSchema, 'test'>]: DeepString<BaseTranslationSchema[K]>;
};

// Maps all leaf string literal types to string, keeping structure strict.
// 'test' is optional so pt-BR can omit it to verify fallback.
export type TranslationSchema = RequiredTranslationSchema & {
  test?: Partial<DeepString<BaseTranslationSchema['test']>>;
};

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: NonNullable<ObjectType[Key]> extends object
    ? `${Key}.${NestedKeyOf<NonNullable<ObjectType[Key]>>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<BaseTranslationSchema>;

export type InterpolationParams = Record<string, string | number | boolean | null | undefined>;
