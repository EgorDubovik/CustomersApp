import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type View } from 'react-native';

/**
 * How much of `ref`'s view the keyboard covers, in px — use it as the view's paddingBottom.
 *
 * Made for views that reach the bottom of the screen inside a Modal, where KeyboardAvoidingView
 * counts from the top of the sheet instead of the top of the screen and leaves the input under
 * the keyboard. iOS: the keyboard's height. Android: measured on screen (measureInWindow); if the
 * window itself shrinks for the keyboard, the overlap is just 0.
 */
export function useKeyboardOverlap(enabled = true) {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setOverlap(0);
      return;
    }
    const animate = (e?: KeyboardEvent) => {
      if (Platform.OS !== 'ios') return;
      LayoutAnimation.configureNext({
        duration: e?.duration || 250,
        update: { type: LayoutAnimation.Types.keyboard },
      });
    };
    const onShow = (e: KeyboardEvent) => {
      const keyboardTop = e.endCoordinates.screenY;
      if (Platform.OS === 'ios') {
        // Inside a pageSheet measureInWindow is relative to the sheet, not the screen, so it can't
        // be compared with the keyboard. The sheet always reaches the bottom of the screen, so the
        // keyboard covers exactly its own height (0 when it is hiding: screenY is past the screen).
        const { height: screenHeight } = Dimensions.get('screen');
        const next = keyboardTop >= screenHeight ? 0 : Math.round(e.endCoordinates.height);
        animate(e);
        setOverlap(next);
        return;
      }
      ref.current?.measureInWindow((_x, y, _w, h) => {
        const next = Math.max(0, Math.round(y + h - keyboardTop));
        animate(e);
        setOverlap(next);
      });
    };
    const onHide = (e: KeyboardEvent) => {
      animate(e);
      setOverlap(0);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];
    // iOS also reports keyboard size changes (e.g. switching to emoji) as a frame change.
    if (Platform.OS === 'ios') subs.push(Keyboard.addListener('keyboardWillChangeFrame', onShow));
    return () => subs.forEach((s) => s.remove());
  }, [enabled]);

  return { ref, overlap, keyboardOpen: overlap > 0 };
}
