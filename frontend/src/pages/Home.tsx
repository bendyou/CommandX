import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import ProfileMenu from '../components/ProfileMenu'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [currentSection, setCurrentSection] = useState(0)
  const sectionsRef = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Отслеживание текущей секции при прокрутке
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 2
      const sections = sectionsRef.current

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        if (section) {
          const sectionTop = section.offsetTop
          const sectionBottom = sectionTop + section.offsetHeight

          if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
            setCurrentSection(i)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Проверяем при монтировании

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Intersection Observer для анимаций при появлении элементов
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in')
          // Отключаем наблюдение после анимации для производительности
          observerRef.current?.unobserve(entry.target)
        }
      })
    }, observerOptions)

    // Небольшая задержка для того, чтобы элементы успели отрендериться
    const timeoutId = setTimeout(() => {
      const animatedElements = document.querySelectorAll('.fade-in, .slide-up, .scale-in, .feature-card, .floating-card')
      animatedElements.forEach((el) => {
        if (observerRef.current) {
          observerRef.current.observe(el)
        }
      })
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      observerRef.current?.disconnect()
    }
  }, [])

  const handleIndicatorClick = (index: number) => {
    const targetSection = sectionsRef.current[index]
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setCurrentSection(index)
    }
  }

  return (
    <div className="home-page" ref={containerRef}>
      {/* Auth Buttons */}
      <div className="auth-buttons">
        {token ? (
          <ProfileMenu />
        ) : (
          <>
            <button 
              onClick={(e) => {
                e.currentTarget.classList.add('button-click-animation')
                setTimeout(() => navigate('/login'), 300)
              }}
              className="auth-btn login-btn-small button-animated"
            >
              <span className="button-content">Войти</span>
            </button>
            <button 
              onClick={(e) => {
                e.currentTarget.classList.add('button-click-animation')
                setTimeout(() => navigate('/register'), 300)
              }}
              className="auth-btn register-btn button-animated"
            >
              <span className="button-content">Регистрация</span>
            </button>
          </>
        )}
      </div>

      {/* Scroll Indicator */}
      <div className="scroll-indicator">
        <div 
          className={`indicator-dot ${currentSection === 0 ? 'active' : ''}`}
          onClick={() => handleIndicatorClick(0)}
        ></div>
        <div 
          className={`indicator-dot ${currentSection === 1 ? 'active' : ''}`}
          onClick={() => handleIndicatorClick(1)}
        ></div>
        <div 
          className={`indicator-dot ${currentSection === 2 ? 'active' : ''}`}
          onClick={() => handleIndicatorClick(2)}
        ></div>
      </div>

      {/* Section 1: Hero */}
      <section 
        className={`home-section hero-section ${currentSection === 0 ? 'active' : ''}`}
        ref={(el) => { 
          if (el) sectionsRef.current[0] = el 
        }}
      >
        <div className="animated-bg"></div>
        
        <div className="section-content">
          <div className="hero-content fade-in">
            <h1 className="hero-title">
              CommandX
            </h1>
            <p className="hero-subtitle">
              Интеллектуальная панель для управления серверами
            </p>
            <p className="hero-description">
              Превращаем работу с серверами в удобный и понятный процесс. 
              Больше никаких сложных команд и терминалов — теперь всё, что нужно 
              для управления инфраструктурой, доступно через современный веб-интерфейс.
            </p>
            <button 
              onClick={(e) => {
                e.currentTarget.classList.add('button-click-animation')
                setTimeout(() => {
                  if (token) {
                    navigate('/servers')
                  } else {
                    navigate('/login')
                  }
                }, 300)
              }} 
              className="hero-button button-animated"
            >
              <span className="button-content">
                <span>Начать работу</span>
                <span className="button-arrow">→</span>
              </span>
            </button>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1 slide-up">
              <div className="card-icon">🖥️</div>
              <div className="card-text">Управление серверами</div>
              <div className="card-description">
                Подключайтесь к серверам по SSH, выполняйте команды и управляйте инфраструктурой через удобный веб-интерфейс
              </div>
            </div>
            <div className="floating-card card-2 slide-up">
              <div className="card-icon">📁</div>
              <div className="card-text">Файловый менеджер</div>
              <div className="card-description">
                Просматривайте и управляйте файлами на удаленных серверах без необходимости использования терминала
              </div>
            </div>
            <div className="floating-card card-3 slide-up">
              <div className="card-icon">⚡</div>
              <div className="card-text">Мониторинг в реальном времени</div>
              <div className="card-description">
                Отслеживайте загрузку CPU, использование памяти и состояние системы в режиме реального времени
              </div>
            </div>
            <div className="floating-card card-4 slide-up">
              <div className="card-icon">🔒</div>
              <div className="card-text">Безопасность</div>
              <div className="card-description">
                Защищенные соединения, шифрование данных и система контроля доступа для максимальной безопасности
              </div>
            </div>
          </div>
        </div>
        <div className="scroll-hint">
          <span>Прокрутите вниз</span>
          <div className="scroll-arrow">↓</div>
        </div>
      </section>

      {/* Section 2: Features */}
      <section 
        className={`home-section features-section ${currentSection === 1 ? 'active' : ''}`}
        ref={(el) => { 
          if (el) sectionsRef.current[1] = el 
        }}
      >
        <div className="animated-bg"></div>
        <div className="section-content">
          <h2 className="section-title fade-in">Почему выбирают CommandX</h2>
          <div className="features-grid">
            <div className="feature-card scale-in">
              <div className="feature-icon">🤖</div>
              <h3>AI-помощник</h3>
              <p>
                Интеллектуальный помощник подсказывает команды, объясняет ошибки и помогает оптимизировать работу с серверами.
              </p>
            </div>
            <div className="feature-card scale-in">
              <div className="feature-icon">📈</div>
              <h3>Гибкость и масштабируемость</h3>
              <p>
                Подключайте неограниченное количество серверов и управляйте всей инфраструктурой из единого интерфейса.
              </p>
            </div>
            <div className="feature-card scale-in">
              <div className="feature-icon">🔧</div>
              <h3>Автоматизация задач</h3>
              <p>
                Создавайте скрипты, настраивайте автоматические задачи и упрощайте рутинные операции одним кликом.
              </p>
            </div>
            <div className="feature-card scale-in">
              <div className="feature-icon">📊</div>
              <h3>Детальная аналитика</h3>
              <p>
                Получайте подробные отчеты о производительности, анализируйте логи и отслеживайте историю изменений.
              </p>
            </div>
            <div className="feature-card scale-in">
              <div className="feature-icon">👥</div>
              <h3>Командная работа</h3>
              <p>
                Совместная работа над проектами, управление правами доступа и координация действий команды.
              </p>
            </div>
            <div className="feature-card scale-in">
              <div className="feature-icon">🔌</div>
              <h3>Интеграции и API</h3>
              <p>
                Подключайте внешние сервисы, используйте REST API для автоматизации и расширяйте функциональность.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: CTA */}
      <section 
        className={`home-section cta-section ${currentSection === 2 ? 'active' : ''}`}
        ref={(el) => { 
          if (el) sectionsRef.current[2] = el 
        }}
      >
        <div className="animated-bg"></div>
        <div className="cta-decorative-elements">
          <div className="cta-particle particle-1"></div>
          <div className="cta-particle particle-2"></div>
          <div className="cta-particle particle-3"></div>
          <div className="cta-particle particle-4"></div>
        </div>
        <div className="section-content">
          <div className="cta-main-content fade-in">
            <div className="cta-icon">🎯</div>
            <h2>Готовы начать?</h2>
            <p className="cta-description">
              Присоединяйтесь к CommandX и упростите управление своими серверами. 
              Начните работу уже сегодня и почувствуйте разницу.
            </p>
          </div>
          
          <div className="cta-stats">
            <div className="cta-stat-card scale-in">
              <div className="stat-number">1000+</div>
              <div className="stat-label">Активных пользователей</div>
            </div>
            <div className="cta-stat-card scale-in">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Uptime</div>
            </div>
            <div className="cta-stat-card scale-in">
              <div className="stat-number">24/7</div>
              <div className="stat-label">Поддержка</div>
            </div>
          </div>

          <div className="cta-features">
            <div className="cta-feature-item fade-in">
              <span className="feature-check">✓</span>
              <span>Быстрая регистрация</span>
            </div>
            <div className="cta-feature-item fade-in">
              <span className="feature-check">✓</span>
              <span>Простое управление</span>
            </div>
            <div className="cta-feature-item fade-in">
              <span className="feature-check">✓</span>
              <span>Мгновенный доступ</span>
            </div>
          </div>

          <button 
            onClick={(e) => {
              e.currentTarget.classList.add('button-click-animation')
              setTimeout(() => {
                if (token) {
                  navigate('/servers')
                } else {
                  navigate('/login')
                }
              }, 300)
            }} 
            className="cta-button scale-in button-animated"
          >
            <span className="button-content">
              <span>Начать работу</span>
              <span className="button-arrow">→</span>
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}
