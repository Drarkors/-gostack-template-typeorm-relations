import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExits = await this.customersRepository.findById(customer_id);

    if (!customerExits) {
      throw new AppError('Could not find any customer with given id');
    }
    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length) {
      throw new AppError('Could not find any products with given ids');
    }

    const existentProductsIds = existentProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find products with ids: ${checkInexistentProducts}`,
      );
    }

    const orderedProductsQuantity = products.map(product => ({
      id: product.id,
      quantity:
        existentProducts.filter(p => p.id === product.id)[0].quantity -
        product.quantity,
    }));

    const checkUnavailableProducts = orderedProductsQuantity.filter(
      product => product.quantity < 0,
    );

    if (checkUnavailableProducts.length) {
      const productsUnavailable = checkUnavailableProducts.map(product => {
        // const availableQuantity = existentProducts.find(
        //   p => p.id === product.id,
        // );
        const orderQuantity = product.quantity;

        return { orderQuantity };
      });

      throw new AppError(
        `There are products with no available quantity to finish the order: ${productsUnavailable}`,
      );
    }

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExits,
      products: serializedProducts,
    });

    return order;
  }
}

export default CreateOrderService;
