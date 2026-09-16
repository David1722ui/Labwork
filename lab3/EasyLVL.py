# ==========================================
# 1. БАЗОВЫЙ УРОВЕНЬ: Вариант 3 (Car)
# ==========================================
class Car:
    def __init__(self, brand: str, model: str, year: int, speed: int = 0):
        self.brand = brand
        self.model = model
        self.year = year
        self.speed = speed

    def accelerate(self, amount: int):
        """Увеличение скорости"""
        self.speed += amount
        print(f"[{self.brand} {self.model}] Разогнался до {self.speed} км/ч.")

    def stop(self):
        """Полная остановка"""
        self.speed = 0
        print(f"[{self.brand} {self.model}] Автомобиль остановлен.")

    def display_info(self):
        """Вывод информации об авто"""
        print(f"Автомобиль: {self.brand} {self.model} ({self.year} г.), Скорость: {self.speed} км/ч")
