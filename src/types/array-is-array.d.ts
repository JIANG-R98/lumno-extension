// Array.isArray narrows to unknown[] rather than any[], so values read from
// storage, messages or JSON stay unknown until checked.
interface ArrayConstructor {
  isArray(arg: unknown): arg is unknown[];
}
