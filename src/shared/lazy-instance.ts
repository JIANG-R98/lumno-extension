// A value made on first use and kept: the one instance of a view API a page
// or injected script draws through.
function lazyInstance<T>(create: () => T): () => T {
  let holder: { value: T } | null = null;
  return () => {
    if (!holder) {
      holder = { value: create() };
    }
    return holder.value;
  };
}

export { lazyInstance };
