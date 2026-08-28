import type { ButtonHTMLAttributes, ReactNode } from 'react';

export default function Button({ variant = 'secondary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; children: ReactNode }) { return <button className={`button ${variant}`} {...props}>{children}</button>; }
