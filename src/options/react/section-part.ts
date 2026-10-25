// A section of a settings tab as its module last drew it, with the handlers
// its view reports to.
export interface SectionPart<M, H> {
  model: M;
  handlers: H;
}
