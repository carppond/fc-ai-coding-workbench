use parking_lot::{Condvar, Mutex};
use std::collections::VecDeque;

pub(super) const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_CHUNKS: usize = 8;

#[derive(Default)]
struct WindowState {
    subscribed: bool,
    closed: bool,
    next_sequence: u64,
    acknowledged: u64,
    bytes: usize,
    pending: VecDeque<(u64, usize)>,
}

/// Credits cover emitted data until xterm has parsed it, not merely received it.
#[derive(Default)]
pub(super) struct OutputWindow {
    state: Mutex<WindowState>,
    changed: Condvar,
}

impl OutputWindow {
    pub(super) fn subscribe(&self) {
        let mut state = self.state.lock();
        state.subscribed = true;
        self.changed.notify_all();
    }

    /// Blocks the coalescer, and consequently the bounded PTY reader, when full.
    pub(super) fn reserve(&self, bytes: usize) -> Option<u64> {
        assert!(bytes <= MAX_OUTPUT_BYTES);
        let mut state = self.state.lock();
        while !state.closed
            && (!state.subscribed
                || state.bytes + bytes > MAX_OUTPUT_BYTES
                || state.pending.len() >= MAX_OUTPUT_CHUNKS)
        {
            self.changed.wait(&mut state);
        }
        if state.closed {
            return None;
        }
        state.next_sequence += 1;
        let sequence = state.next_sequence;
        state.bytes += bytes;
        state.pending.push_back((sequence, bytes));
        Some(sequence)
    }

    /// Cumulative acknowledgements tolerate IPC completion arriving out of order.
    pub(super) fn acknowledge(&self, sequence: u64) -> Result<(), String> {
        let mut state = self.state.lock();
        if sequence > state.next_sequence {
            return Err("Cannot acknowledge terminal output that was not sent".into());
        }
        if sequence <= state.acknowledged || state.closed {
            return Ok(());
        }
        while let Some(&(pending_sequence, bytes)) = state.pending.front() {
            if pending_sequence > sequence {
                break;
            }
            state.pending.pop_front();
            state.bytes -= bytes;
        }
        state.acknowledged = sequence;
        self.changed.notify_all();
        Ok(())
    }

    /// Exit is delivered only after the final output has been parsed.
    pub(super) fn wait_until_drained(&self) -> bool {
        let mut state = self.state.lock();
        while !state.closed && (!state.subscribed || !state.pending.is_empty()) {
            self.changed.wait(&mut state);
        }
        !state.closed
    }

    pub(super) fn close(&self) {
        let mut state = self.state.lock();
        state.closed = true;
        self.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;

    #[test]
    fn output_waits_for_valid_cumulative_parse_acknowledgements() {
        let window = Arc::new(OutputWindow::default());
        window.subscribe();
        let first = window.reserve(MAX_OUTPUT_BYTES / 2).unwrap();
        let second = window.reserve(MAX_OUTPUT_BYTES / 2).unwrap();
        let (sent, received) = mpsc::channel();
        let producer_window = Arc::clone(&window);
        let producer = std::thread::spawn(move || {
            sent.send(producer_window.reserve(1)).unwrap();
        });
        assert_eq!(
            received.recv_timeout(Duration::from_millis(50)),
            Err(mpsc::RecvTimeoutError::Timeout)
        );
        assert!(window.acknowledge(second + 1).is_err());
        window.acknowledge(second).unwrap();
        let third = received
            .recv_timeout(Duration::from_secs(2))
            .unwrap()
            .unwrap();
        producer.join().unwrap();

        // A late, older ACK must not free the new output or announce exit early.
        window.acknowledge(first).unwrap();
        let (sent, received) = mpsc::channel();
        let exit_window = Arc::clone(&window);
        let exit = std::thread::spawn(move || {
            sent.send(exit_window.wait_until_drained()).unwrap();
        });
        assert_eq!(
            received.recv_timeout(Duration::from_millis(50)),
            Err(mpsc::RecvTimeoutError::Timeout)
        );
        window.acknowledge(third).unwrap();
        assert!(received.recv_timeout(Duration::from_secs(2)).unwrap());
        exit.join().unwrap();
    }

    #[test]
    fn tiny_chunks_cannot_create_an_unbounded_outstanding_queue() {
        let window = Arc::new(OutputWindow::default());
        window.subscribe();
        let first = window.reserve(1).unwrap();
        for _ in 1..MAX_OUTPUT_CHUNKS {
            window.reserve(1).unwrap();
        }
        let (sent, received) = mpsc::channel();
        let producer_window = Arc::clone(&window);
        let producer = std::thread::spawn(move || {
            sent.send(producer_window.reserve(1)).unwrap();
        });
        assert_eq!(
            received.recv_timeout(Duration::from_millis(50)),
            Err(mpsc::RecvTimeoutError::Timeout)
        );
        window.acknowledge(first).unwrap();
        assert!(received
            .recv_timeout(Duration::from_secs(2))
            .unwrap()
            .is_some());
        producer.join().unwrap();
    }

    #[test]
    fn closing_releases_both_subscription_and_credit_waiters() {
        for subscribed in [false, true] {
            let window = Arc::new(OutputWindow::default());
            if subscribed {
                window.subscribe();
                window.reserve(MAX_OUTPUT_BYTES).unwrap();
            }
            let (sent, received) = mpsc::channel();
            let producer_window = Arc::clone(&window);
            let producer = std::thread::spawn(move || {
                sent.send(producer_window.reserve(1)).unwrap();
            });
            assert_eq!(
                received.recv_timeout(Duration::from_millis(50)),
                Err(mpsc::RecvTimeoutError::Timeout)
            );
            window.close();
            assert_eq!(received.recv_timeout(Duration::from_secs(2)).unwrap(), None);
            assert!(!window.wait_until_drained());
            producer.join().unwrap();
        }
    }
}
