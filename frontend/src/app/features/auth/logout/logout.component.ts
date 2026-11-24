import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-logout',
  styleUrl: './logout.component.scss',
  templateUrl: './logout.component.html',
})
export class LogoutComponent implements OnInit {
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    this.authService.completeLogout();
  }
}
