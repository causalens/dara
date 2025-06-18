import { useCallback, useRef } from 'react';

export interface UseIMEOptions<T extends HTMLInputElement | HTMLTextAreaElement> {
    onKeyDown?: (e: React.KeyboardEvent<T>) => void;
    onKeyUp?: (e: React.KeyboardEvent<T>) => void;
    onCompositionStart?: (e: React.CompositionEvent<T>) => void;
    onCompositionEnd?: (e: React.CompositionEvent<T>) => void;
}

export interface UseIMEReturn<T extends HTMLInputElement | HTMLTextAreaElement> {
    // composition events (bubble‐phase)
    onCompositionStart: React.CompositionEventHandler<T>;
    onCompositionEnd: React.CompositionEventHandler<T>;
    // key events (capture‐phase)
    onKeyDownCapture: React.KeyboardEventHandler<T>;
    onKeyUpCapture: React.KeyboardEventHandler<T>;
    // key events (bubble‐phase)
    onKeyDown: React.KeyboardEventHandler<T>;
    onKeyUp: React.KeyboardEventHandler<T>;
}

/**
 * Hook to handle IME composition in input elements.
 * Prevents firing and bubbling events during IME composition or confirmation.
 *
 * @param {UseIMEOptions} options - the user handlers to wrap
 */
function useIMEEnter<T extends HTMLInputElement | HTMLTextAreaElement = HTMLTextAreaElement>({
    onKeyDown: userKeyDown,
    onKeyUp: userKeyUp,
    onCompositionStart: userCompStart,
    onCompositionEnd: userCompEnd,
}: UseIMEOptions<T>): UseIMEReturn<T> {
    const isComposingRef = useRef(false);
    const justEndedRef = useRef(false);

    // --- composition (bubble phase) ---
    const handleCompositionStart = useCallback(
        (e: React.CompositionEvent<T>) => {
            isComposingRef.current = true;
            userCompStart?.(e);
        },
        [userCompStart]
    );

    const handleCompositionEnd = useCallback(
        (e: React.CompositionEvent<T>) => {
            isComposingRef.current = false;
            // mark to swallow the next keyup (IE/FF/Safari) or 229 keydown (Safari)
            justEndedRef.current = true;
            userCompEnd?.(e);
        },
        [userCompEnd]
    );

    // --- keydown (capture phase) ---
    const handleKeyDownCapture = useCallback((e: React.KeyboardEvent<T>) => {
        // 1) swallow all keys during IME composition
        if (isComposingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        // 2) swallow that spurious 229‐keydown right after compositionend
        if (justEndedRef.current) {
            if (e.which === 229) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // a real key => clear the flag and let it through
            justEndedRef.current = false;
        }
        // do *not* call userKeyDown here
    }, []);

    // --- keydown (bubble phase) ---
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<T>) => {
            // simply short-circuit while IME composing
            if (isComposingRef.current) {
                return;
            }
            userKeyDown?.(e);
        },
        [userKeyDown]
    );

    // --- keyup (capture phase) ---
    const handleKeyUpCapture = useCallback((e: React.KeyboardEvent<T>) => {
        // swallow all keyups during composition
        // or the one immediately after compositionend
        if (isComposingRef.current || justEndedRef.current) {
            justEndedRef.current = false;
            e.preventDefault();
            e.stopPropagation();
        }
        // do *not* call userKeyUp
    }, []);

    // --- keyup (bubble phase) ---
    const handleKeyUp = useCallback(
        (e: React.KeyboardEvent<T>) => {
            // short-circuit any leftover composition noise
            if (isComposingRef.current || justEndedRef.current) {
                justEndedRef.current = false;
                return;
            }
            userKeyUp?.(e);
        },
        [userKeyUp]
    );

    return {
        onCompositionStart: handleCompositionStart,
        onCompositionEnd: handleCompositionEnd,
        onKeyDownCapture: handleKeyDownCapture,
        onKeyDown: handleKeyDown,
        onKeyUpCapture: handleKeyUpCapture,
        onKeyUp: handleKeyUp,
    };
}
export default useIMEEnter;
