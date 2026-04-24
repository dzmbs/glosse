import type { BookIdentity, RetrievedChunk } from "../src/ai/types.ts";

/**
 * Canned passages loosely in the shape of "Rust Atomics and Locks" Ch. 1.
 * The text is paraphrased so the bench doesn't ship copyrighted material.
 * Shape matches what `hybridRetrieve` returns so generators accept it
 * without any DB layer.
 */
export const FIXTURE_BOOK: BookIdentity & {
  currentPage: number;
  totalPages: number;
} = {
  bookId: "bench-rust-atomics",
  title: "Rust Atomics and Locks",
  author: "Mara Bos",
  currentPage: 24,
  totalPages: 280,
};

export const FIXTURE_PASSAGES: RetrievedChunk[] = [
  {
    chunkId: 101,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "A thread is an independent unit of execution that runs a function. In Rust, the standard library exposes threads through std::thread::spawn. Each thread has its own stack and can be scheduled by the OS independently of every other thread in the program.",
    pageNumber: 9,
    score: 0.82,
  },
  {
    chunkId: 102,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "Because a spawned thread may outlive the function that created it, Rust forces closures passed to spawn to have a 'static lifetime. This is why the move keyword is so common here: it transfers ownership of captured variables into the closure, avoiding dangling references at runtime.",
    pageNumber: 14,
    score: 0.78,
  },
  {
    chunkId: 103,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "Scoped threads solve a real ergonomic pain. std::thread::scope guarantees that all threads spawned inside the scope have finished before the scope returns, so those threads are allowed to borrow from the enclosing stack frame — they cannot outlive the data they reference.",
    pageNumber: 16,
    score: 0.77,
  },
  {
    chunkId: 104,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "The redesign of std::thread::scope was part of the response to the realization that Rust cannot rely on Drop being called for safety. Because memory can be leaked (for example via reference cycles), the safe interface has to work even when destructors never run. This episode is often called The Leakpocalypse.",
    pageNumber: 17,
    score: 0.75,
  },
  {
    chunkId: 105,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "Shared ownership across threads is typically expressed with Arc. Arc<T> is an atomically reference-counted smart pointer: cloning it bumps an atomic counter, dropping it decrements, and the value is freed when the last Arc goes away. Arc's clone does not deep-copy T.",
    pageNumber: 20,
    score: 0.74,
  },
  {
    chunkId: 106,
    sectionIndex: 0,
    chapterTitle: "Basics of Rust Concurrency",
    text: "Mutexes and RwLocks round out the toolkit. A Mutex<T> grants exclusive access to the wrapped value through its lock method, which returns a guard that unlocks on drop. An RwLock<T> allows many concurrent readers or one exclusive writer — which pattern fits depends on the read/write ratio of the workload.",
    pageNumber: 22,
    score: 0.72,
  },
];
