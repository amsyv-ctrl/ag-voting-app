import { ReactNode } from 'react'
import { motion } from 'framer-motion'

type SectionMotionProps = {
  children: ReactNode
  className?: string
  delay?: number
  zoom?: boolean
}

export function SectionMotion({ children, className, delay = 0, zoom = false }: SectionMotionProps) {
  return (
    <motion.div
      initial={zoom ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: 24 }}
      whileInView={zoom ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
