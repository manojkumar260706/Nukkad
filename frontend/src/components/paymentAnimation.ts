export function playPaymentAnimation(host: HTMLElement, height = '100vh', status = 'Opening Razorpay…') {
  const paymentDocument = host.ownerDocument;
  const bag = paymentDocument.createElement('div');
  bag.setAttribute('aria-hidden', 'true');
  Object.assign(bag.style, {
    width: 'clamp(3.5rem, 13vw, 6.5rem)',
    aspectRatio: '1.12',
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: '1',
    display: 'grid',
    placeItems: 'center',
    background: 'linear-gradient(145deg, #2c7651, #153d2e)',
    color: '#f5ead3',
    borderRadius: '0.7rem 0.7rem 1.6rem 1.6rem',
    boxShadow: '0 0.8rem 1.4rem #153d2e30',
    font: 'bold clamp(1.5rem, 6vw, 3rem) Georgia, serif'
  });

  const handle = paymentDocument.createElement('div');
  Object.assign(handle.style, {
    position: 'absolute',
    top: '-1rem',
    width: '44%',
    height: '1.25rem',
    border: '0.3rem solid #276246',
    borderBottom: '0',
    borderRadius: '2rem 2rem 0 0'
  });
  bag.append(handle, 'N');

  const message = paymentDocument.createElement('span');
  message.textContent = status;
  message.setAttribute('role', 'status');
  Object.assign(message.style, {
    position: 'absolute',
    top: 'calc(50% + 5.5rem)',
    width: '100%',
    textAlign: 'center'
  });

  Object.assign(host.style, {
    margin: '0',
    position: host.id === 'startup' ? 'fixed' : 'relative',
    minHeight: height,
    display: 'grid',
    placeContent: 'center stretch',
    justifyItems: 'center',
    overflow: 'hidden',
    background: '#fbfbf9',
    color: '#153d2e',
    font: '600 1rem system-ui, sans-serif'
  });
  const stage = paymentDocument.createElement('div');
  Object.assign(stage.style, {
    position: 'relative',
    width: '100%',
    minHeight: '9rem',
    display: 'grid',
    placeItems: 'center'
  });
  const wordmark = paymentDocument.createElement('div');
  wordmark.setAttribute('aria-label', 'NUKKAD');
  Object.assign(wordmark.style, {
    font: 'bold clamp(2.75rem, 12vw, 8rem) Georgia, serif',
    letterSpacing: '0.035em',
    lineHeight: '1',
    whiteSpace: 'nowrap'
  });

  const letters = Array.from('NUKKAD', character => {
    const letter = paymentDocument.createElement('span');
    letter.textContent = character;
    letter.setAttribute('aria-hidden', 'true');
    letter.style.display = 'inline-block';
    wordmark.append(letter);
    return letter;
  });
  stage.append(wordmark, bag);
  host.replaceChildren(stage, message);

  const edge = stage.clientWidth / 2 + bag.offsetWidth;
  const stageCenter = stage.getBoundingClientRect().left + stage.clientWidth / 2;
  const rollDuration = 1600;
  for (const letter of letters) {
    const bounds = letter.getBoundingClientRect();
    const distance = bounds.left + bounds.width / 2 - stageCenter + bag.offsetWidth / 2;
    const delay = rollDuration * (distance + edge) / (2 * edge);
    letter.animate(
      [{ opacity: 0, transform: 'translateY(0.2em)' }, { opacity: 1, transform: 'translateY(0)' }],
      { delay, duration: 120, fill: 'both', easing: 'ease-out' }
    );
  }

  const roll = (x: number, degrees: number) =>
    `translate(calc(-50% + ${x}px), -50%) rotate(${degrees}deg)`;
  return bag.animate(
    [
      { transform: roll(-edge, 0), offset: 0 },
      { transform: roll(edge, 1080), offset: 0.8 },
      { transform: roll(edge, 1080), offset: 1 }
    ],
    { duration: 2000, easing: 'linear', fill: 'both' }
  );
}
