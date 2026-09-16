# Импортируем наши классы из соответствующих файлов
from car import Car
from bank_account import BankAccount
from library import Library

# ==========================================
# ТЕСТИРОВАНИЕ И ДЕМОНСТРАЦИЯ (3 объекта на класс)
# ==========================================
if __name__ == "__main__":
    print("--- ТЕСТ: БАЗОВЫЙ УРОВЕНЬ (Car) ---")
    car1 = Car("Toyota", "Camry", 2021)
    car2 = Car("BMW", "M5", 2023)
    car3 = Car("Hyundai", "Elantra", 2019)

    car1.display_info()
    car1.accelerate(60)
    car1.stop()

    car2.accelerate(120)
    car3.display_info()

    print("\n--- ТЕСТ: СРЕДНИЙ УРОВЕНЬ (BankAccount) ---")
    acc1 = BankAccount("Алихан", 15000)
    acc2 = BankAccount("Дамир", 5000)
    acc3 = BankAccount("Алия", 50000)

    acc1.deposit(10000)
    acc1.withdraw(7000)

    acc2.withdraw(10000)  # Тест на ошибку нехватки средств
    print(f"Баланс Алии: {acc3.get_balance()} тг.")

    print("\n--- ТЕСТ: ПОВЫШЕННЫЙ УРОВЕНЬ (Library) ---")
    lib1 = Library("Центральная городская")
    lib2 = Library("Университетская")
    lib3 = Library("Личная коллекция")

    lib1.add_book("Изучаем Python")
    lib1.add_book("Чистый код")
    lib1.search_book("Чистый код")
    lib1.remove_book("Чистый код")
    lib1.search_book("Чистый код")

    lib2.add_book("Архитектура ЭВМ")
    lib3.add_book("Ведьмак")
